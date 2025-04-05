all: firefox-zip chrome-zip

# make a zip file suitable for loading into
# about:debugging#/runtime/this-firefox -> Load Temporary Add-On
firefox-zip:
	./make-zip.sh firefox

chrome-zip:
	./make-zip.sh chromium

