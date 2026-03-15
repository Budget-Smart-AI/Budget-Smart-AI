$lines = Get-Content 'server/routes.ts'
$start = 0
for($i=0; $i -lt $lines.Length; $i++){
    if($lines[$i] -match 'api/auth/register'){
        $start = $i
        break
    }
}
# Print line numbers too
for($j=$start; $j -le ($start+80); $j++){
    Write-Host ($j+1).ToString() + ": " + $lines[$j]
}
