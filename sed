#!/usr/bin/env bash
# Make BSD-style "sed -i ''" work on GNU sed (Ubuntu CI).
if [[ "$1" == "-i" && "$2" == "''" ]]; then
  shift 2
  exec /usr/bin/sed -i'' "$@"
else
  exec /usr/bin/sed "$@"
fi
