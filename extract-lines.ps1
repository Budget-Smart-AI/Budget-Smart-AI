$lines = Get-Content 'server/routes.ts'
$total = $lines.Count
# Find the admin GET users endpoint
for ($i = 0; $i -lt $total; $i++) {
    if ($lines[$i] -match 'app\.get.*api/admin/users') {
        $start = [Math]::Max(0, $i - 2)
        $end = [Math]::Min($total - 1, $i + 60)
        for ($j = $start; $j -le $end; $j++) {
            Write-Host "$($j+1): $($lines[$j])"
        }
        Write-Host "---"
    }
}
