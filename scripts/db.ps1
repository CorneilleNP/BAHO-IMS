<#
  Local PostgreSQL helper (portable install in ~/tools, no admin needed).

  Usage (from the repo root, in PowerShell):
    .\scripts\db.ps1 start     # start the database server
    .\scripts\db.ps1 stop      # stop it
    .\scripts\db.ps1 status    # is it running?
    .\scripts\db.ps1 psql      # SQL shell on the baho_ims database
    .\scripts\db.ps1 tables    # list tables with row counts
    .\scripts\db.ps1 pgadmin   # open pgAdmin (graphical tool)
#>
param([ValidateSet('start','stop','status','psql','tables','pgadmin')][string]$Command = 'status')

$Bin  = Join-Path $HOME 'tools\pgsql\bin'
$Data = Join-Path $HOME 'tools\pgdata'
$Log  = Join-Path $HOME 'tools\pgdata.log'
$env:PGPASSWORD = 'postgres'   # dev only

switch ($Command) {
  'start'  { & "$Bin\pg_ctl.exe" -D $Data -l $Log -o "-c listen_addresses=localhost -p 5432" -w start }
  'stop'   { & "$Bin\pg_ctl.exe" -D $Data -w stop }
  'status' { & "$Bin\pg_ctl.exe" -D $Data status }
  'psql'   { & "$Bin\psql.exe" -h localhost -U postgres -d baho_ims }
  'tables' {
    & "$Bin\psql.exe" -h localhost -U postgres -d baho_ims -c "select relname as table, n_live_tup as rows from pg_stat_user_tables order by relname;"
  }
  'pgadmin' { Start-Process (Join-Path $HOME 'tools\pgsql\pgAdmin 4\runtime\pgAdmin4.exe') }
}
