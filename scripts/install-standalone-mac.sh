#!/bin/zsh
set -eu
task_script_dir="${0:A:h}"
task_project="${task_script_dir:h}"
task_source="${1:-$task_project/dist/standalone/mac/md-to-kindle.app}"
task_destination="$HOME/Applications/md-to-kindle.app"
task_service="$HOME/Library/Services/Send to Kindle.workflow"
if [[ ! -d "$task_source/Contents" ]]; then
  print -u2 'Provide the extracted md-to-kindle.app as the first argument.'
  exit 1
fi
if /usr/bin/pgrep -f '/md-to-kindle.app/Contents/MacOS/md-to-kindle' >/dev/null; then
  print -u2 'Close md-to-kindle before installing an update.'
  exit 1
fi
mkdir -p "$HOME/Applications" "$HOME/Library/Services"
/usr/bin/ditto "$task_source" "$task_destination"
/usr/bin/ditto "$task_project/standalone/Send to Kindle.workflow" "$task_service"
/System/Library/CoreServices/pbs -update
print 'Installed md-to-kindle and Finder Quick Actions > Send to Kindle.'
print 'Open the app once to configure the email account on this Mac.'
