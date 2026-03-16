$lines = Get-Content 'c:\Users\Ryan Mahabir\projects\Budget-Smart-AI\server\routes.ts'
$total = $lines.Count

# Show lines 5318-5400 (the webhook query and token handling)
for ($i = 5317; $i -le 5400; $i++) {
    Write-Output "$($i+1): $($lines[$i])"
}
