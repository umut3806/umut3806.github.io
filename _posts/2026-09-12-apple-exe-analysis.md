---
layout: post
title: "apple.exe Analysis"
date: 2026-09-12
description: "A line-by-line x86 reverse engineering analysis of apple.exe from the Flare Learning Hub MACC labs."
permalink: /blogs/apple-exe-analysis/
category: Reverse engineering
series: Flare Learning Hub / MACC Labs
filename: apple.exe
md5: "30E92463EE572D8DBFA95FF3285BFA82"
toc:
  - title: First look with DiE
    id: first-look-with-die
  - title: Assembly analysis
    id: line-by-line-assembly-analysis-with-ida
  - title: Stack frames
    id: stack-frames
  - title: Calling conventions
    id: calling-conventions
  - title: Registers and local variables
    id: registers-and-local-variables
  - title: Comparisons and branches
    id: comparisons-and-branches
  - title: Function epilogue
    id: function-epilogue
  - title: Return values and the ABI
    id: return-values-and-the-abi
---

Here, we will analyze the executable line by line. Our aim is not to answer the questions in the lab. After we analyze the executable, these will already be a piece of cake.

## First Look with DiE

<aside class="blog-note" aria-label="Note: Understanding DiE">
  <p class="blog-note__title">Note &middot; Understanding DiE</p>
  <p>DiE is not a magical tool. It parses the PE file headers and combines them to show us a result. If we wanted, we could also write our own PE parser and see similar results. You can check the PE file format for more information.</p>
</aside>

First of all, we put the binary into DiE to understand the general structure of the executable.

<img src="{{ '/assets/blogs/apple-exe-analysis/die-overview.png' | relative_url }}" alt="DiE overview showing PE32 and compiler information" style="width: 700px; max-width: 100%; height: auto;" width="766" height="111" loading="lazy">

We see that the source code is written in C and compiled for the 32-bit i386 architecture, which means x86. It is a PE (Portable Executable) file, so we know that this file is meant to run on Windows.

Let's check the strings in the binary using the Strings tab in DiE.

<img src="{{ '/assets/blogs/apple-exe-analysis/die-strings.png' | relative_url }}" alt="DiE strings view for apple.exe" style="width: 700px; max-width: 100%; height: auto;" width="909" height="298" loading="lazy">

- The strings in the PE header are generic, so there is nothing interesting in them.
- `KERNEL32.dll` and `MSVCRT.dll` show that the executable will probably use some operating system APIs by loading these DLLs into memory at runtime. We can also confirm this because `printf` and `scanf` are C runtime I/O functions imported from MSVCRT. Their implementation ultimately relies on system calls for console or file I/O.
- We also have some application-specific strings like `"apple"` and `"banana"`, but they don't seem very interesting for now. `"Enter a string:"` is probably what the executable prints on the screen when it wants user input.

The sections also include the usual sections: `.text` for code, `.rdata` for constant initialized data (read-only), and `.data` for non-constant initialized data.

<img src="{{ '/assets/blogs/apple-exe-analysis/pe-sections.png' | relative_url }}" alt="PE section table in DiE" style="max-width: 100%; height: auto;" width="1421" height="117" loading="lazy">

We can also sometimes see a `.bss` data section that holds uninitialized data. We can summarize these below:

```text
.text   -> executable code
.rdata  -> read-only initialized data
.data   -> writable initialized data
.bss / uninitialized data
        -> The compiler does not need to store actual zero bytes inside the
           compiled binary file, saving disk space. It only stores how much
           memory the section needs at runtime. The size is described in the PE;
           the Windows loader allocates the region and initializes it to zero.
```

Let's disassemble the binary in IDA.

## Line-by-Line Assembly Analysis with IDA

Here, I don't want to convert the assembly to pseudocode. We will prefer the hard way, but this will help us understand assembly code much better when we look at it.

We will go through the assembly code one instruction at a time and try to understand each one. We will also see some concepts, such as stack frames, function prologues and epilogues, calling conventions, ABIs, etc.

Let's start with the entry point of the executable, which is named `start` in IDA.

<aside class="blog-note" aria-label="Note: Entry point vs. main">
  <p class="blog-note__title">Note &middot; Entry point vs. main</p>
  <p><code>start</code> does <strong>not necessarily mean <code>main()</code></strong>.</p>
  <p>For a Windows executable, execution may look like this:</p>
  <pre><code class="language-text">Windows loader
    ↓
PE EntryPoint ("start")
    ↓
C/C++ runtime initialization
    ↓
main / WinMain</code></pre>
  <p>Or, in malware and hand-written assembly:</p>
  <pre><code class="language-text">Windows loader
    ↓
start
    ↓
malware's own code directly</code></pre>
</aside>

<img src="{{ '/assets/blogs/apple-exe-analysis/ida-start.png' | relative_url }}" alt="IDA disassembly of the start function" style="max-width: 100%; height: auto;" width="426" height="548" loading="lazy">

### Stack Frames

```asm
var_84 = byte ptr -84h
var_4  = byte ptr -4
```

These are local variables of the `start` function. They look like hexadecimal values, but they are not values. They are offsets in the stack. We will see this in more detail below.

```asm
push    ebp
mov     ebp, esp
sub     esp, 84h
```

This is a "function prologue." Functions have it at the beginning. Its purpose is to prepare a stack frame for the function's local variables. To understand how it does this, we will look at the diagram below:

<img src="{{ '/assets/blogs/apple-exe-analysis/stack-frame-diagram.png' | relative_url }}" alt="Caller and callee stack frame diagram" style="max-width: 100%; height: auto;" width="399" height="299" loading="lazy">

<p class="image-source"><span>Source</span><a href="https://chessman7.substack.com/p/how-your-code-executes-a-guide-to">How your code executes &mdash; Chessman</a></p>

First of all, in x86 (32-bit) and x86-64 (the 64-bit version), the stack grows downward. So, new stack frames are added at lower addresses. In other words, older frames are at higher addresses. As you can see in the diagram, the caller's stack frame is higher than the callee's. As you can understand from the names, one is the caller (the first function) and the other is the callee (the second function, which is called).

<aside class="blog-note" aria-label="Note: Stack direction depends on the architecture">
  <p class="blog-note__title">Note &middot; Stack direction depends on the architecture</p>
  <p>Not every CPU works this way. For example, the Intel 8051 stack grows upward toward higher memory addresses. But we can take the sentence "stacks grow downward" as a general rule.</p>
</aside>

In x86, functions are called with the `call` mnemonic and a function address:

```asm
call 0x12345678
another_instruction    ; return address
```

When the CPU reads that line, it pushes the address of the next instruction after `call` onto the stack. Then it jumps to the called function address. So, under the hood, we can think of the `call` mnemonic like this:

```asm
push return_address
jmp 0x12345678
```

After jumping to the function, the program executes the "function prologue," as we mentioned. This structure creates a "stack frame" for the callee. For this purpose, it first pushes the base address of the caller function's stack frame onto the stack. This way, the program will remember it when it needs to return to the caller. The assembly code for this is `push ebp`.

Right now, the stack pointer points to the base of the new stack frame. So, we need to move that pointer to `EBP` (the base pointer register) with `mov ebp, esp`.

Now, we need to reserve some space for our local variables. We had two local variables. One has a `0x4`-byte offset, and the other has a `0x84`-byte offset. This means we have a 4-byte variable and a 128-byte (`0x80`) variable. So, we should reserve a space that is `0x84` bytes in length. Because of this, we subtract from `ESP` (remember, the stack grows downward) with `sub esp, 84h`.

Let's continue with the assembly code:

```asm
push    offset aEnterAString    ; "Enter a string: "
call    printf
add     esp, 4
```

This is a function call. Let's look at the `push` instruction more closely.

Here, `push` is a **mnemonic**. A mnemonic is the human-readable name of a machine instruction.

`offset` here means "take the address, not the value."

`aEnterAString` is a label given by IDA to make the assembly code more readable. This label holds the address of the first character of the string `"Enter a string: "`. So, it holds the address of the character `"E"`.

In total, `push offset aEnterAString` means "put the address of the first character of the string onto the stack."

But we must be aware that assembly syntax can change. This one is called **MASM syntax**. IDA uses MASM by default. MASM syntax generally uses explicit operators like `OFFSET`, `PTR`, `BYTE PTR`, `DWORD PTR`, etc. So, we can often see these in IDA.

There is also **NASM syntax**. NASM is more minimal. For example, we can push the address of a string like this in NASM:

```asm
push aEnterAString     ; We don't need any assembler operator.
```

The reason for this is that NASM treats each label as an address. The fundamental NASM rule is:

```text
label       = address
[label]     = memory contents at that address
```

In NASM, a bare label evaluates to its address, while `[label]` dereferences that address. In MASM, a bare typed data label is normally treated as a memory operand, so it refers to the value stored at that location. To explicitly get the address, MASM uses `OFFSET`.

```asm
; Let's define our label like this.

.data
myVar DWORD 12345678h

; Let's assume myVar is stored at address 00402000h.

; Then:

mov eax, myVar

; means:

EAX = 12345678h

; If we said:

mov eax, OFFSET myVar

; It would be:

EAX = 00402000h
```

It may be a little complex. But the good news is that the CPU does not care whether you wrote NASM or MASM syntax. Both assemblers ultimately produce machine code. We can think of them as syntax differences.

Okay, now we pushed the address of the string onto the stack. Then we call the `printf` function. After that, we increment the stack pointer (`ESP`).

### Calling Conventions

This is known as a "calling convention." There are plenty of calling conventions, but we can mention a few of them to understand the concept better.

One calling convention is `cdecl`. In this convention, arguments are pushed onto the stack from right to left. After the function finishes its execution and returns, the caller should handle the cleanup of the arguments.

Here is an example:

```asm
push 3
push 2
push 1
call func
add  esp, 0Ch    ; Here, the caller cleans the arguments by moving the stack pointer higher.
                 ; It increments by 0xC because 3 variables = 3 * 4 bytes.
```

This is equivalent to:

```c
func(1, 2, 3);
```

Another one is `stdcall`. This is nearly the same, but this time the callee should handle the cleanup of the arguments.

Here is an example:

```asm
push 3
push 2
push 1
call func
```

```asm
func:
    ...
    ret 0Ch    ; means:
               ; 1. pop the return address
               ; 2. remove another 0xC bytes of arguments
```

There is also `fastcall`. In this convention, arguments are passed through both registers and the stack so that some arguments can be accessed faster from registers. Usually, the first argument is placed in `ECX`, the second in `EDX`, and the remaining ones on the stack. Usually, the callee cleans the arguments.

Here is an example:

```asm
mov ecx, 10
mov edx, 20
push 30
call func
```

This is equivalent to:

```c
func(10, 20, 30);
```

We can summarize them in a table:

| Calling convention | Arguments | Stack cleanup |
| --- | --- | --- |
| `cdecl` | Stack | Caller |
| `stdcall` | Stack | Callee |
| `fastcall` | Registers + stack | Usually callee |

Our assembly code uses `cdecl`, as you can see, because the argument to `printf` is pushed onto the stack, and after `printf` returns, the caller cleans the arguments.

From this, we can easily understand that the program prints the string `"Enter a string: "` on the screen.

Let's continue:

```asm
lea     eax, [ebp+var_84]
push    eax
push    offset a15s            ; "%15s"
call    scanf
add     esp, 8
```

The `lea` mnemonic is used to store an address. In this case, the address is calculated with `ebp+var_84`. `var_84` is a negative number here. When it is added to `ebp`, it means `ebp-0x84`. `0x84` is an offset here. `ebp` currently holds the base address of the stack frame for the function. So, it means: "Start from the base address of the stack frame, go `0x84` below it, and load that address into `eax`." Note that it does not load the value at that address.

Then, we see the usual `push` operations for pushing arguments onto the stack. One of them is `eax`. After these pushes, there is a `call` mnemonic, which means these arguments will be used by `scanf`. If we think about it for a second, `scanf` needs a format string and the address of a buffer to store the input. So, we can think of this code like this:

```c
char buffer[128];

scanf("%15s", buffer);

// Here, the buffer length is 128 bytes (0x80). We also have a 4-byte local
// variable. Because of this, the offset to the beginning of the buffer is 0x84.
```

Then, we see the stack cleanup again with the `add` mnemonic. But this time, we have to clean two different arguments, which are 8 bytes in total (two 32-bit addresses).

Let's continue:

```asm
mov     cl, [ebp+var_84]
mov     [ebp+var_4], cl
mov     dl, [ebp+var_4]
```

### Registers and Local Variables

Here, we see a register named `cl`. This is actually part of the `ecx` register. More specifically, it is the lower 8 bits of that register. You can understand this better with the image below:

<img src="{{ '/assets/blogs/apple-exe-analysis/x86-register-layout.png' | relative_url }}" alt="x86 general-purpose register layout" style="width: 597px; max-width: 100%; height: auto;" width="960" height="720" loading="lazy">

<p class="image-source"><span>Source</span><a href="https://www.cs.virginia.edu/~evans/cs216/guides/x86.html">x86 Assembly Guide &mdash; University of Virginia</a></p>

This time, the mnemonic is `mov`, not `lea`. It will now copy the value, and this is important, the **value** at the address calculated by `[ebp+var_84]`.

As you know, this is our buffer for `scanf`. `scanf` will write our input from lower addresses to higher addresses, i.e., from bottom to top. If you enter `"abc"`, your buffer will look like this:

```text
Higher addresses
      ↑

Address       Value
0x1003        00    '\0'   ; null byte, which shows the end of the string
0x1002        63    'c'
0x1001        62    'b'
0x1000        61    'a'    ; [ebp+var_84] will calculate to this address,
                           ; but not exactly 0x1000. It is for visualization purposes.
      ↓
Lower addresses
```

Yes, we have a lot more space. With this input, we don't touch those memory locations.

Now, we have the first character of the input we typed in the lower 8 bits of the `ECX` register.

Then, this character is copied to the address `[ebp+var_4]`, which is 4 bytes below the base pointer. Then, it is copied to `dl`, which is the lower 8 bits of the `edx` register.

You may ask: "Why didn't it copy directly from `[ebp+var_84]` to `dl`?" Well, you are right; it could. But the compiler might try to preserve the source code structure. Because `[ebp+var_4]` is a local variable, it might first want to store the first character in that local variable, like this:

```c
char buffer[128];
char c;

scanf("%15s", buffer);

c = buffer[0];    // Store the first character in the local variable.
```

This is unoptimized output from the compiler. Compilers can output this kind of machine code for debugging purposes. With this, when we debug the program, we can trace the stack easily and see which local variable is assigned to which value.

Let's continue:

```asm
push    edx
call    sub_401000
```

We are pushing all of the `edx` register onto the stack, not only the lower 8 bits. Then, we call a function. From here, we can understand that the character is the argument to `sub_401000`.

<aside class="blog-note" aria-label="Note: Working with a single byte">
  <p class="blog-note__title">Note &middot; Working with a single byte</p>
  <p>Some may want to push only 1 byte onto the stack. It can be done this way:</p>
</aside>

```asm
dec esp        ; Equal to "sub esp, 1". First, we move the stack pointer
               ; one byte down because it points to the latest pushed value.
mov [esp], dl
```

Let's jump to `sub_401000`:

<img src="{{ '/assets/blogs/apple-exe-analysis/sub-401000.png' | relative_url }}" alt="IDA graph view of sub_401000" style="width: 700px; max-width: 100%; height: auto;" width="1092" height="631" loading="lazy">

The first two assembly instructions are function prologue instructions, which we discussed above.

`push ecx` looks very strange at first. But think about it for a second. Is it the same as `sub esp, 4` in terms of reserving space? Yes. Here, the value of `ECX` is not important. It is only reserving some space for the local variables of the new function.

Then, we see a new symbol here, `arg_0`. It is defined as `8`. In fact, this shows an offset. It is `8` because `[ebp+8]` calculates to the first argument. Let's look at the visual below to understand it better (my drawing is really good, man :)):

<aside class="blog-note" aria-label="Note: Understanding endianness">
  <p class="blog-note__title">Note &middot; Understanding endianness</p>
  <p>To understand the image below, you should understand "endianness." There are two types of endianness: little endian and big endian. Little endian means lower addresses hold the least significant byte of multi-byte values. Big endian means lower addresses hold the most significant byte of multi-byte values. Do not forget that these concepts are only valid for multi-byte values. You can think of it as being written from left to right. Both x86 and x86-64 are little-endian architectures. So, as you can see in the image below, the least significant bytes are held at lower addresses.</p>
</aside>

<img src="{{ '/assets/blogs/apple-exe-analysis/stack-argument-layout.png' | relative_url }}" alt="Stack layout showing first argument at EBP plus 8" style="max-width: 100%; height: auto;" width="1776" height="1043" loading="lazy">

Okay, now I think we understand why it is calculated as `[ebp+8]`. With `mov al, [ebp+8]`, it copies the first character we provided into the `al` register. Then, with `mov [ebp+var_4], al`, it copies this character to a local variable shown as `var_4`. As you remember, we also reserved space for this local variable. As we said before, it didn't have to do this.

### Comparisons and Branches

Then, we see a `cmp` instruction:

```asm
cmp [ebp+var_4], 61h    ; a
jz  short_loc40101E
```

In fact, at the machine-code level, comparison operations are performed by subtraction. So, `cmp a, b` evaluates `a - b`. After this operation, the `EFLAGS` register is updated. The subtraction result itself is not stored; only the flags are updated.

<img src="{{ '/assets/blogs/apple-exe-analysis/eflags-register.png' | relative_url }}" alt="EFLAGS register layout" style="max-width: 100%; height: auto;" width="1600" height="522" loading="lazy">

<p class="image-source"><span>Source</span><a href="https://grandidierite.github.io/basic-execution-environment-of-intel-processor-32-bit-architecture/">Intel 32-bit execution environment &mdash; Grandidierite</a></p>

What is important for us here is `ZF` (Zero Flag). This flag is set to `1` if the subtraction above results in zero. You can also research the other fields. At the end of the day, the `cmp` mnemonic subtracts two values and adjusts the flags accordingly.

`jz` is a conditional jump. You can read it as "jump if zero," "jump if there is no difference," or "jump if they are equal."

There is also an unconditional jump, which you may have seen before: `jmp`. This mnemonic does not look at any flags and jumps to the given address in any situation. You can also research other jump mnemonics.

Here, we have `jz`, so we jump if they are equal. We are comparing the first character with `"a"`. This can be written like this:

```c
if (firstChar == 'a')
```

From now on, we see the same patterns we saw before:

```asm
push    offset Format   ; "apple\n"
call    printf
add     esp, 4

; This will print "apple\n" on the screen and clean the argument from the stack.
```

If we look at the other branches, we will see similar assembly code. If it is not `"a"` but `"b"`, it prints `"banana\n"`. If it is not `"b"` either but `"c"`, it prints `"cantalope\n"`. If it is a completely different character, we can think of it as the default branch of a switch-case statement, and it prints `"no fruit\n"`.

### Function Epilogue

After that, we have an important section before returning from the function:

```asm
loc_401058:
mov     esp, ebp
pop     ebp
retn    4
```

This is known as a "function epilogue." These are found at the end of functions. Their purpose is to clear the stack frame. Sometimes, they can also clean arguments if the callee is responsible for this according to the calling convention. In this situation, yes, the callee will clean the argument.

Here is another visualization by me:

<img src="{{ '/assets/blogs/apple-exe-analysis/function-epilogue.png' | relative_url }}" alt="Stack layout before and after the function epilogue" style="max-width: 100%; height: auto;" width="2048" height="921" loading="lazy">

Here, first, we move the stack pointer to point to the old base pointer because we will pop that old address into `ebp` in the next step. With this, we adjust `ebp` to the old function's base address. Now, our `ESP` points to the return address. If we use only `retn`, we will pop that address into `eip`, which is the instruction pointer and holds the address of the next instruction the CPU will execute. But this way, if the caller doesn't clean the arguments, they remain on the stack. In this case, the caller does not clear them, as we will see below. This time, the callee clears these arguments with `retn 4`, which means "pop the return address into `eip`, then increment the stack pointer by 4." This way, a 4-byte variable will be cleaned from the stack.

Now, we return to the next instruction after the very first call:

```asm
mov [ebp+var_4], al
```

### Return Values and the ABI

You may ask what the deal with `al` is right now. Well, to understand this, we first need to understand how functions return values to their callers.

<aside class="blog-note" aria-label="Note: What is an ABI?">
  <p class="blog-note__title">Note &middot; What is an ABI?</p>
  <p>Below, we will mention the ABI (Application Binary Interface). Let me explain it here first. An ABI defines the low-level rules that compiled programs follow to work together, such as how function arguments are passed, where return values are placed, which registers must be preserved, and how the stack is used. For instance, a calling convention, which we mentioned above, is one part of an ABI.</p>
</aside>

Common ABIs use patterns like the following. Exact return rules depend on the operating system, compiler, ABI, type size, and type layout.

| Return type | x86-32 | x86-64 |
| --- | --- | --- |
| Integer | `EAX` | `RAX` |
| Pointer | `EAX` | `RAX` |
| 64-bit integer | `EDX:EAX` | `RAX` |
| 128-bit integer | Usually memory / ABI-dependent | `RDX:RAX` on System V AMD64 |
| `float` / `double` | `ST(0)` | `XMM0` |
| Small struct by value | ABI-dependent, may use registers | Registers if ABI rules allow, such as `RAX/RDX` or XMM registers |
| Large struct by value | Hidden pointer to caller-provided memory, such as a local variable or temporary | Hidden pointer to caller-provided memory, such as a local variable or temporary |
| Struct pointer | `EAX` | `RAX` |

The distinction between a struct by value and a struct pointer is this:

```text
struct S *foo()   -> returns an address in EAX

struct S foo()    -> caller secretly provides an address
                     (for example, the address of a local variable or temporary),
                     and foo writes the struct there
```

For example:

```c
int main() {
    struct S x = foo();
}

// x is a local variable in main, so the hidden pointer may simply be &x, like
// this: foo(&x);
```

In `mov [ebp+var_4], al`, `AL` contains the low byte of the value returned in `EAX` by the previous function call. You may wonder where that value was set, since `sub_401000` does not explicitly move anything into `EAX`. The answer is the `printf` call inside `sub_401000`. `printf` returns the number of characters successfully written in `EAX`. If `sub_401000` returns without modifying `EAX`, that value is still there.

Let's continue:

```asm
push    0                      ; uExitCode
call    ds:ExitProcess
```

Here, we push `0` as the argument to the `ExitProcess` function and then call it. This way, the process will exit.

That was the complete analysis of the executable. Thanks for reading. See you later...
