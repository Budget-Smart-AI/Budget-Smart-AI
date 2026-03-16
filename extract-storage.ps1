$lines = Get-Content 'c:\Users\Ryan Mahabir\projects\Budget-Smart-AI\server\storage.ts'
$idx = ($lines | Select-String 'async createPlaidItem' | Select-Object -Last 1).LineNumber - 1
$lines[$idx..($idx+40)]
