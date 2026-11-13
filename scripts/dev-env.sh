#!/usr/bin/env bash
# Source this in your shell before running npm/node commands on this machine:
#   source scripts/dev-env.sh
#
# This machine has no system-wide Node.js install and no permission to run
# the elevated MSI installer, so we use Node's portable zip build instead.
# It also sits behind a corporate TLS-inspecting proxy whose root CA isn't
# in Node's bundled trust store (even though the OS trusts it), so we also
# point Node/npm at an exported copy of the Windows root CA store.
#
# One-time setup (already done once on this machine under ~/tools, kept
# here so a fresh machine/dev can reproduce it):
#   1. Download & extract https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip to ~/tools/node
#   2. Export Windows root CAs to a PEM bundle:
#        powershell -Command "Get-ChildItem Cert:\LocalMachine\Root | % { [Convert]::ToBase64String($_.RawData) }" > ~/tools/roots_b64.txt
#      then wrap each base64 blob in BEGIN/END CERTIFICATE markers into ~/tools/ca-bundle.pem

export PATH="$HOME/tools/node:$PATH"
export NODE_EXTRA_CA_CERTS="$HOME/tools/ca-bundle.pem"
