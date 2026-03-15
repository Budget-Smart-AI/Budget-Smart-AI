$lines = Get-Content 'server/routes.ts'
$start = 0
for($i=0; $i -lt $lines.Length; $i++){
    if($lines[$i] -match 'api/auth/register'){
        $start = $i
        break
    }
}
$lines[$start..($start+120)]
