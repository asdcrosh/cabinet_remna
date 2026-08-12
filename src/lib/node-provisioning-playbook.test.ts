import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const playbook = readFileSync(resolve('deploy/provisioner/ansible/playbook.yml'), 'utf8')
const renewalWrapper = readFileSync(resolve('deploy/provisioner/ansible/templates/acme-renew.sh.j2'), 'utf8')

function taskBlock(name: string) {
  const start = playbook.indexOf(`    - name: ${name}`)
  const end = playbook.indexOf('\n    - name:', start + 1)
  return playbook.slice(start, end < 0 ? undefined : end)
}

describe('node provisioning playbook safety', () => {
  it('uses the pinned official SelfSteal force mode without expect', () => {
    expect(playbook).toContain('selfsteal_script_version: 2.10.0')
    expect(playbook).toContain('3594f3a4ddae19582f9dde95fdf65edeaf2892dec662eadabba55e1f8faff4c4')
    expect(playbook).toContain('- --force')
    expect(playbook).toContain('- --domain')
    expect(playbook).not.toContain('ansible.builtin.expect')
  })

  it('runs the acme.sh installer from its extracted source directory', () => {
    expect(playbook).toContain('chdir: /usr/local/src/acme.sh-{{ acme_script_version }}')
  })

  it('fails closed for unknown Docker state and self-signed certificates', () => {
    expect(playbook).toContain("existing_selfsteal_container.stderr | default('') is search('No such object')")
    expect(playbook).toContain('selfsteal_container_is_owned')
    expect(playbook).toContain('com.docker.compose.project.working_dir')
    expect(playbook).toContain('com.docker.compose.project.config_files')
    expect(playbook).toContain('Verify the mounts of the existing SelfSteal container')
    expect(playbook).toContain("selfsteal_dir + '/nginx.conf|/etc/nginx/nginx.conf'")
    expect(playbook).toContain("selfsteal_dir + '/conf.d|/etc/nginx/conf.d'")
    expect(playbook).toContain("selfsteal_dir + '/ssl|/etc/nginx/ssl'")
    expect(playbook).toContain("selfsteal_dir + '/html|/var/www/html'")
    expect(playbook).toContain('existing_selfsteal_container_mounts.rc == 0')
    expect(playbook).toContain('selfsteal_configured_domain.stdout | trim == node_fqdn')
    expect(playbook).toContain("grep -Fx -- {{ ('SELF_STEAL_DOMAIN=' + node_fqdn) | quote }}")
    expect(playbook).toContain('selfsteal_container_domain_matches | bool')
    expect(playbook).toContain('- selfsteal_container_is_owned | bool')
    expect(playbook).toContain('Stop when SelfSteal used its self-signed fallback')
    expect(playbook).toContain("is search('Using self-signed certificate')")
    expect(playbook).toMatch(/content: \|\n\s+\{\{ provisioning_job_id \}\} \{\{ node_fqdn \}\}/)
    expect(playbook).not.toContain("selfsteal_script_sha256 }}\\n'")
  })

  it('validates incomplete SelfSteal files instead of skipping their checks', () => {
    expect(taskBlock('Validate the existing SelfSteal Compose project')).not.toContain('\n      when:')
    expect(taskBlock('Validate the existing certificate hostname')).not.toContain('\n      when:')
    expect(taskBlock('Validate the existing certificate lifetime')).not.toContain('\n      when:')
  })

  it('always removes ACME redirect rules when renewal exits', () => {
    expect(renewalWrapper).toContain('trap cleanup_redirects EXIT INT TERM')
    expect(renewalWrapper).toContain('iptables -t nat -D PREROUTING')
    expect(renewalWrapper).toContain('iptables -t nat -D OUTPUT')
  })

  it('keeps the UFW assertion a string for Ansible 2.19', () => {
    expect(playbook).toContain(`- "'Status: active' in final_ufw_status.stdout"`)
    expect(playbook).not.toContain("- final_ufw_status.stdout is search('Status: active')")
  })
})
