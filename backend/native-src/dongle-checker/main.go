//go:build windows

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"syscall"
	"time"
	"unsafe"
)

const sdFind int32 = 1

type checkResult struct {
	OK        bool    `json:"ok"`
	Retcode   *int32  `json:"retcode"`
	CheckedAt string  `json:"checkedAt"`
	Error     *string `json:"error,omitempty"`
}

type options struct {
	dllPath       string
	retryCount    int
	retryInterval time.Duration
}

func main() {
	opts := readOptions()

	retcode, err := checkDongle(opts)
	if err != nil {
		message := err.Error()
		emit(checkResult{
			OK:        false,
			Retcode:   nil,
			CheckedAt: utcNow(),
			Error:     &message,
		})
		os.Exit(2)
	}

	emit(checkResult{
		OK:        retcode == 0,
		Retcode:   &retcode,
		CheckedAt: utcNow(),
	})
}

func readOptions() options {
	dllPath := flag.String("dll", "", "Path to System8.dll")
	retryCount := flag.Int("retry-count", 3, "Dongle retry count")
	retryIntervalSeconds := flag.Float64("retry-interval", 1, "Dongle retry interval in seconds")
	flag.Parse()

	if *dllPath == "" {
		emit(checkResult{
			OK:        false,
			Retcode:   nil,
			CheckedAt: utcNow(),
			Error:     stringPtr("missing required --dll"),
		})
		os.Exit(2)
	}

	retries := *retryCount
	if retries < 1 {
		retries = 1
	}

	interval := *retryIntervalSeconds
	if interval < 0 {
		interval = 0
	}

	return options{
		dllPath:       *dllPath,
		retryCount:    retries,
		retryInterval: time.Duration(interval * float64(time.Second)),
	}
}

func checkDongle(opts options) (int32, error) {
	dll := syscall.NewLazyDLL(opts.dllPath)
	proc := dll.NewProc("SecureDongle")

	if err := proc.Find(); err != nil {
		return 0, err
	}

	var retcode int32
	for attempt := 0; attempt < opts.retryCount; attempt += 1 {
		retcode = callSecureDongle(proc)
		if retcode == 0 {
			return retcode, nil
		}

		if attempt < opts.retryCount-1 && opts.retryInterval > 0 {
			time.Sleep(opts.retryInterval)
		}
	}

	return retcode, nil
}

func callSecureDongle(proc *syscall.LazyProc) int32 {
	handle := int32(0)
	lp1 := int32(0)
	lp2 := int32(0)
	passwords := donglePasswords()
	buffer := make([]byte, 1024)

	retcode, _, _ := proc.Call(
		uintptr(sdFind),
		uintptr(unsafe.Pointer(&handle)),
		uintptr(unsafe.Pointer(&lp1)),
		uintptr(unsafe.Pointer(&lp2)),
		uintptr(unsafe.Pointer(&passwords[0])),
		uintptr(unsafe.Pointer(&passwords[1])),
		uintptr(unsafe.Pointer(&passwords[2])),
		uintptr(unsafe.Pointer(&passwords[3])),
		uintptr(unsafe.Pointer(&buffer[0])),
	)

	return int32(retcode)
}

func donglePasswords() [4]int32 {
	encoded := [4]uint32{0x8d46d2d5, 0xb7c27fd7, 0x8d462902, 0xb7c208ae}
	masks := [4]uint32{0x8d46d38f, 0xb7c2528f, 0x8d46c38f, 0xb7c2558f}

	return [4]int32{
		int32((encoded[0] ^ masks[0]) & 0xffff),
		int32((encoded[1] ^ masks[1]) & 0xffff),
		int32((encoded[2] ^ masks[2]) & 0xffff),
		int32((encoded[3] ^ masks[3]) & 0xffff),
	}
}

func emit(payload checkResult) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		fmt.Println(`{"ok":false,"retcode":null,"checkedAt":"` + utcNow() + `","error":"json marshal failed"}`)
		return
	}

	fmt.Println(string(encoded))
}

func utcNow() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func stringPtr(value string) *string {
	return &value
}
