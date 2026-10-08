#!/bin/zsh
set -eu
task_service="$HOME/Library/Services/Send to Kindle.workflow"
if [[ -d "$task_service" ]]; then
  task_backup="$HOME/Library/Services/Send to Kindle.workflow.disabled"
  if [[ -e "$task_backup" ]]; then
    print -u2 'The disabled workflow already exists. Remove or rename it before retrying.'
    exit 1
  fi
  /bin/mv "$task_service" "$task_backup"
fi
/System/Library/CoreServices/pbs -update
print 'Disabled the Finder Quick Action. The app and its protected email profile were preserved.'
