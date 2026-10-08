#!/bin/zsh
set -eu
task_script_dir="${0:A:h}"
task_project="${task_script_dir:h}"
task_source="${1:-$task_project/dist/standalone/mac/md-to-kindle.app}"
task_destination="$HOME/Applications/md-to-kindle.app"
if [[ ! -d "$task_source/Contents" ]]; then
  print -u2 'Provide the extracted md-to-kindle.app as the first argument.'
  exit 1
fi
if /usr/bin/pgrep -f '/md-to-kindle.app/Contents/MacOS/md-to-kindle' >/dev/null; then
  print -u2 'Close md-to-kindle before installing an update.'
  exit 1
fi
mkdir -p "$HOME/Applications"
if [[ -d "$task_destination" ]]; then
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$task_destination"
fi
/usr/bin/ditto "$task_source" "$task_destination"
zsh "$task_script_dir/remove-legacy-desktop-mac.sh"
print 'Installed md-to-kindle in ~/Applications. Open it and choose files or a folder.'
print 'Open the app once to configure the email account on this Mac.'
