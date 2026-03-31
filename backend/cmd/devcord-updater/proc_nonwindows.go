//go:build !windows

package main

import "os/exec"

func applyDetachedProcessAttrs(_ *exec.Cmd) {
}
