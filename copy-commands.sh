#!/bin/bash

SRC_FILE="commands.json"
EXT_DIR="extension"
BACKEND_DIR="backend"

cp "$SRC_FILE" "$EXT_DIR/commands.json"
cp "$SRC_FILE" "$BACKEND_DIR/commands.json"

echo "commands.json copied to $EXT_DIR/ and $BACKEND_DIR/"