$lines = Get-Content 'c:\Users\Ryan Mahabir\projects\Budget-Smart-AI\server\routes.ts'
$idx = ($lines | Select-String 'api/plaid/exchange-token' | Select-Object -First 1).LineNumber - 1
$lines[$idx..($idx+55)]
