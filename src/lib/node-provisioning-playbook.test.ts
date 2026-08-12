import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const playbook = readFileSync(resolve('deploy/provisioner/ansible/playbook.yml'), 'utf8')
const renewalWrapper = readFileSync(resolve('deploy/provisioner/ansible/templates/acme-renew.sh.j2'), 'utf8')

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
    expect(playbook).toContain('Stop when SelfSteal used its self-signed fallback')
    expect(playbook).toContain("is search('Using self-signed certificate')")
    expect(playbook).toMatch(/content: \|\n\s+\{\{ provisioning_job_id \}\} \{\{ node_fqdn \}\}/)
    expect(playbook).not.toContain("selfsteal_script_sha256 }}\\n'")
  })

  it('always removes ACME redirect rules when renewal exits', () => {
    expect(renewalWrapper).toContain('trap cleanup_redirects EXIT INT TERM')
    expect(renewalWrapper).toContain('iptables -t nat -D PREROUTING')
    expect(renewalWrapper).toContain('iptables -t nat -D OUTPUT')
  })
})
