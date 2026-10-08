#!/bin/zsh
set -eu
task_script_dir="${0:A:h}"
zsh "$task_script_dir/remove-legacy-desktop-mac.sh"
print 'Legacy actions removed. The app in ~/Applications and its protected email profile were preserved.'
