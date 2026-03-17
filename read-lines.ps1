param([string]$file, [int]$start, [int]$end)
$lines = Get-Content $file
$i = $start
for ($j = $start - 1; $j -le $end - 1; $j++) {
    Write-Output ("{0}: {1}" -f $i, $lines[$j])
    $i++
}
