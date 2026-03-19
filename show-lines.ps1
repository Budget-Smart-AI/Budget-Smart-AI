$lines = Get-Content 'server\routes.ts'
$lines[3415..3455] | ForEach-Object -Begin {$n=3416} -Process { '{0}: {1}' -f $n, $_; $n++ }
