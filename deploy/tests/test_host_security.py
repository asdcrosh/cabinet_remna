"""Exercise portable security backup/restore against isolated files and services."""
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'full-stack-backup.sh'
SSH = 'etc/ssh/sshd_config.d/00-stealthnet-security.conf'
JAIL = 'etc/fail2ban/jail.d/stealthnet-sshd.local'
KEYS = 'root/.ssh/authorized_keys'


class HostSecurityRestore(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'root'
        self.root.mkdir()
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.library = self.base / 'library.sh'
        self.library.write_text(SCRIPT.read_text().split('case "${1:-menu}" in')[0])
        for name in ['source-key', 'destination-key']:
            subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '',
                            '-C', name, '-f', str(self.base / name)], check=True)
        self.source_key = (self.base / 'source-key.pub').read_text()
        self.destination_key = (self.base / 'destination-key.pub').read_text()
        self.env = os.environ | {
            'FULL_BACKUP_HOST_ROOT': str(self.root),
            'FULL_BACKUP_S3_CONFIG': str(self.base / 'no-s3'),
            'FULL_BACKUP_SCHEDULE_CONFIG': str(self.base / 'no-schedule'),
            'PATH': str(self.bin) + os.pathsep + os.environ['PATH'],
            'SERVICE_LOG': str(self.base / 'services.log'),
        }
        self.mock('sshd', '''
if [ "$1" = -T ]; then
  printf 'pubkeyauthentication yes\\npasswordauthentication %s\\nkbdinteractiveauthentication no\\npermitrootlogin without-password\\nauthorizedkeysfile .ssh/authorized_keys\\n' "${SSH_TEST_PASSWORD:-no}"
fi
exit "${SSH_TEST_FAIL:-0}"
''')
        self.mock('fail2ban-client', 'exit "${F2B_TEST_FAIL:-0}"')
        self.mock('systemctl', 'printf "%s\\n" "$*" >> "$SERVICE_LOG"')

    def mock(self, name, body):
        path = self.bin / name
        path.write_text('#!/bin/sh\n' + body + '\n')
        path.chmod(0o755)

    def write(self, path, value):
        dest = self.root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(value)
        return dest

    def run_function(self, function, archive, **overrides):
        return subprocess.run(['bash', '-c', 'source "$1"; "$2" "$3"',
                               'test', str(self.library), function, str(archive)],
                              env=self.env | overrides, text=True, capture_output=True)

    def archive(self):
        self.write(SSH, 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n')
        self.write(JAIL, '[sshd]\nenabled=true\nbackend=systemd\n')
        self.write(KEYS, self.source_key)
        archive = self.base / 'host-security.tar.gz'
        result = self.run_function('archive_host_security', archive)
        self.assertEqual(result.returncode, 0, result.stderr)
        return archive

    def test_round_trip_keeps_destination_keys_and_excludes_private_identity(self):
        self.write('etc/ssh/ssh_host_ed25519_key', 'must never be copied')
        self.write('root/.ssh/id_ed25519', 'must never be copied')
        self.write('etc/shadow', 'must never be copied')
        archive = self.archive()
        with tarfile.open(archive) as contents:
            self.assertEqual(set(contents.getnames()), {SSH, JAIL, KEYS})
        self.write(KEYS, self.destination_key)
        self.write(SSH, 'PasswordAuthentication yes\n')
        result = self.run_function('restore_host_security', archive)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / KEYS).read_text(), self.destination_key + self.source_key)
        self.assertEqual((self.root / KEYS).stat().st_mode & 0o777, 0o600)
        self.assertIn('PasswordAuthentication no', (self.root / SSH).read_text())
        services = (self.base / 'services.log').read_text()
        self.assertIn('reload ssh', services)
        self.assertIn('enable --now fail2ban', services)
        # Reapplying a backup must not duplicate public keys.
        result = self.run_function('restore_host_security', archive)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / KEYS).read_text(), self.destination_key + self.source_key)

    def test_old_archive_does_not_change_host(self):
        old = self.write(SSH, 'destination-policy\n')
        result = self.run_function('restore_host_security', self.base / 'absent.tar.gz')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(old.read_text(), 'destination-policy\n')
        self.assertFalse((self.base / 'services.log').exists())

    def test_archive_requires_valid_keys_for_password_disabled_policy(self):
        self.write(SSH, 'PasswordAuthentication no\n')
        self.write(KEYS, 'not a public key')
        archive = self.base / 'bad.tar.gz'
        result = self.run_function('archive_host_security', archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(archive.exists())

    def test_rejects_archive_traversal_and_links_before_changes(self):
        original = self.write(SSH, 'destination-policy\n')
        for link in [False, True]:
            archive = self.base / ('link.tar.gz' if link else 'traversal.tar.gz')
            with tarfile.open(archive, 'w:gz') as output:
                entry = tarfile.TarInfo(KEYS if link else '../../escape')
                if link:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = '/etc/shadow'
                    output.addfile(entry)
                else:
                    entry.size = 3
                    output.addfile(entry, io.BytesIO(b'bad'))
            result = self.run_function('restore_host_security', archive)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(original.read_text(), 'destination-policy\n')
        self.assertFalse((self.base / 'services.log').exists())

    def test_invalid_ssh_configuration_rolls_back_files_and_keys(self):
        archive = self.archive()
        self.write(SSH, 'destination-policy\n')
        self.write(KEYS, self.destination_key)
        (self.root / JAIL).unlink()
        result = self.run_function('restore_host_security', archive, SSH_TEST_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / SSH).read_text(), 'destination-policy\n')
        self.assertEqual((self.root / KEYS).read_text(), self.destination_key)
        self.assertFalse((self.root / JAIL).exists())
        self.assertFalse((self.base / 'services.log').exists())

    def test_invalid_fail2ban_configuration_rolls_back_before_ssh_reload(self):
        archive = self.archive()
        self.write(SSH, 'destination-policy\n')
        result = self.run_function('restore_host_security', archive, F2B_TEST_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / SSH).read_text(), 'destination-policy\n')
        self.assertFalse((self.base / 'services.log').exists())

    def test_destination_override_does_not_silently_leave_password_login_enabled(self):
        archive = self.archive()
        self.write(SSH, 'destination-policy\n')
        self.write(KEYS, self.destination_key)
        result = self.run_function('restore_host_security', archive, SSH_TEST_PASSWORD='yes')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('overrides', result.stderr)
        self.assertEqual((self.root / SSH).read_text(), 'destination-policy\n')
        self.assertEqual((self.root / KEYS).read_text(), self.destination_key)
        self.assertFalse((self.base / 'services.log').exists())

    def test_destination_symlink_is_rejected_before_any_policy_is_written(self):
        archive = self.archive()
        self.write(SSH, 'destination-policy\n')
        jail = self.root / JAIL
        jail.unlink()
        outside = self.base / 'outside'
        outside.write_text('keep this file\n')
        jail.symlink_to(outside)
        result = self.run_function('restore_host_security', archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / SSH).read_text(), 'destination-policy\n')
        self.assertEqual(outside.read_text(), 'keep this file\n')
        self.assertFalse((self.base / 'services.log').exists())


if __name__ == '__main__':
    unittest.main()
