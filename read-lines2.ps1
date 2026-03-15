$lines = Get-Content 'server/routes.ts'
# Write sync route (lines 5186-5510)
$output = @()
for ($i = 5185; $i -le 5510; $i++) {
    $output += "$($i+1): $($lines[$i])"
}
$output | Out-File -FilePath 'route-sync.txt' -Encoding utf8

# Write fetch-historical route (lines 5511-5700)
$output2 = @()
for ($i = 5510; $i -le 5700; $i++) {
    $output2 += "$($i+1): $($lines[$i])"
}
$output2 | Out-File -FilePath 'route-historical.txt' -Encoding utf8

Write-Host "Done. Check route-sync.txt and route-historical.txt"
