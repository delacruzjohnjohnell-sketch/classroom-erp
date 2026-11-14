#!/bin/bash
# renders each html in this folder to a pdf with headless Chrome
cd "$(dirname "$0")"
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for f in student-handout practice-set teacher-key handbook; do
  "$C" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$PWD/$f.pdf" "file://$PWD/$f.html" 2>/dev/null
done
ls -la *.pdf
