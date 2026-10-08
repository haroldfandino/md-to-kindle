#!/bin/zsh
set -eu
for task_name in 'Send to Kindle.workflow' 'Send to Kindle.workflow.disabled'; do
  task_service="$HOME/Library/Services/$task_name"
  if [[ -e "$task_service" || -L "$task_service" ]]; then
    /bin/rm -rf -- "$task_service"
  fi
done
/System/Library/CoreServices/pbs -update
print 'Removed legacy Send to Kindle Quick Actions. The app and email profile were preserved.'
