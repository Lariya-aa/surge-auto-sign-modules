# Project Knowledge

## Anyrouter.top Access Constraint

Do not use curl, Surge cron scripts, Surge `script evaluate`, or any non-browser
HTTP client to probe or automate `https://anyrouter.top/`.

Observed behavior:

- Browser/proxy access can trigger `403 Denied by http_auto_ratelimit`.
- Direct access can fail with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`.
- The site returns browser/JavaScript-style WAF challenge cookies such as
  `acw_tc` and `cdn_sec_tc`.

Decision:

- Do not implement an anyrouter.top auto-open or auto-sign cron module.
- Do not recommend switching anyrouter.top to `DIRECT` as a workaround.
- If anyrouter.top must be supported, limit it to manual Chrome/Profile A/B
  browser access and optional passive status/cookie capture only.
- Treat automated requests to this domain as unsafe because they can cause the
  real browser session to be blocked as well.
