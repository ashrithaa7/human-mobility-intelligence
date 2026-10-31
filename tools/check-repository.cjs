// Check the shareable file set without invoking Git or printing any secrets.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
process.chdir(root)
const files = execFileSync('rg', ['--files', '--hidden', '--no-require-git', '-g', '!.git/**'], {encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean)
const unexpected = files.filter(file => /(^|[\\/])(node_modules|venv|\.verification-tools|\.implementation-backup|\.next[^\\/]*)([\\/]|$)|\.sqlite3(?:-|$)|\.log$|database\.env\.local$/.test(file) || /(^|[\\/])\.env(?:$|\.)/.test(file) && !file.endsWith('.env.example'))
const secrets = []
for (const filename of ['frontend/.env.local','backend/.env','.verification-tools/database.env.local']) {
  if (!fs.existsSync(filename)) continue
  for(const line of fs.readFileSync(filename,'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if(separator < 1 || line.startsWith('#')) continue
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g,'')
    if (/^postgres(?:ql)?:/.test(value)) {
      try { const password = new URL(value).password; if(password && !password.includes('YOUR-PASSWORD')) secrets.push(password,decodeURIComponent(password)) } catch {}
    } else if (/KEY|TOKEN|PASSWORD|SECRET/.test(line.slice(0,separator)) && value.length > 16 && !/your-|example/.test(value)) secrets.push(value)
  }
}
const findings = []
for(const file of files) {
  if(fs.statSync(file).size > 2*1024*1024) { findings.push({file,reason:'Large file requires review'}); continue }
  const content = fs.readFileSync(file,'utf8')
  if(secrets.some(secret=>content.includes(secret))) findings.push({file,reason:'Contains a local credential value'})
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) findings.push({file,reason:'Private key material'})
}
console.log(JSON.stringify({checkedFiles:files.length,unexpected,findings,passed:!unexpected.length&&!findings.length},null,2))
if(unexpected.length||findings.length) process.exitCode=1
