$lines = Get-Content 'server/routes.ts'
$start = 5185
$end = 5620
for ($i = $start; $i -le $end; $i++) {
    "$($i+1): $($lines[$i])"
}
