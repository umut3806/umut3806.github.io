---
layout: post
title: "What the Hack Are ASLR, PIE, and Windows Relocations?"
date: 2026-10-04
permalink: /blogs/aslr-pie-windows-relocations/
category: Reverse engineering
toc:
  - title: "Addresses Inside an Executable"
    id: addresses-inside-an-executable
  - title: "Some Terminology"
    id: some-terminology
    children:
      - title: "RVA and File Offset"
        id: rva-and-file-offset
  - title: "Are These Addresses Really Locations in RAM?"
    id: are-these-addresses-really-locations-in-ram
    children:
      - title: "How Can Two Processes Share the Same Memory?"
        id: how-can-two-processes-share-the-same-memory
      - title: "Virtual Layout and Physical Placement"
        id: virtual-layout-and-physical-placement
  - title: "Can We Know Where an Executable Will Be Loaded Before Running It?"
    id: can-we-know-where-an-executable-will-be-loaded-before-running-it
    children:
      - title: "Why the Heck Did People Invent ASLR?"
        id: why-the-heck-did-people-invent-aslr
  - title: "Relative Addressing"
    id: relative-addressing
  - title: "Two Problems Relative Addressing Can't Address"
    id: two-problems-relative-addressing-cant-address
    children:
      - title: "1. The Target Can Live in Another Module"
        id: the-target-can-live-in-another-module
      - title: "2. The Address Can Hide in Data (Pointer)"
        id: the-address-can-hide-in-data-pointer
  - title: "Let's Make It Concrete"
    id: lets-make-it-concrete
    children:
      - title: "PE File"
        id: pe-file
---

Here, we will look at ASLR, PIE and Windows relocations. What the hack are these names in the first place? These names often appear together when we analyze an executable. But what do they actually do? More importantly, why did people need this? Yeah, you may say, it changes the program address basically if you know about it some. But I think we should understand them deeper.

And as always and in this my super duper blog, we will try to understand this concept better.

## Addresses Inside an Executable

First of all, let's imagine that we have a 32-bit Windows executable with this instruction:

```asm
push    00402000h
```

Here, we are pushing `0x00402000` onto the stack. Let's assume that a string begins at this address, and we want to pass its address to a function.

In this 32-bit example, the instruction contains the address directly as a four-byte immediate value. Its machine-code encoding is:

```text
68 00 20 40 00
│  └─────────┘
│   0x00402000, stored in little-endian order
└── opcode for PUSH imm32
```

Let's think one second if our string somewhat was loaded elsewhere. But our instruction still points to the same location. Somebody should handle it.

## Some Terminology

For a PE file, the Optional Header contains a field named `ImageBase`. It specifies the preferred address of the first byte of the loaded image. "Preferred" is important here. This is the address the file was built for, but it may be loaded at another address.

Let's see an example:

```text
Preferred image base:  0x00400000
Address of string:    0x00402000

Offset inside image:   0x00002000
```

This offset is called an **RVA**, or Relative Virtual Address. A **VA**, or Virtual Address, as its name implies, is not relative. For example, the image base is a VA. An RVA describes a position relative to that base. So if we want to calculate the virtual address of memory cells, we can use the below formula:

```text
VA = loaded image base + RVA
```

For our specific string example, if the image is loaded at `0x00500000`, our string will be at:

```text
0x00500000 + 0x00002000 = 0x00502000
```

### RVA and File Offset

An executable file is not the same in memory as it is on disk. Because of this, an RVA is not the same as the file offset.

An RVA tells us where something is relative to the image base in memory. A file offset tells us where its bytes are relative to the beginning of the file on disk. Let's look at an example to understand the difference.

Imagine that the PE section table gives us these values for `.rdata`:

```text
VirtualAddress:    0x2000    -> section starts at this RVA in memory (despite the field name, this is an RVA, not a VA)
PointerToRawData:  0x0600    -> section starts at this offset in the file
SizeOfRawData:     0x0400    -> section has this many bytes stored in the file
VirtualSize:       0x0600    -> section's size in memory
```

<aside class="blog-note" aria-label="Note: Why can the size in memory be larger than on disk? (i.e. why VirtualSize &gt; SizeOfRawData)">
  <p class="blog-note__title">Note &middot; Why can the size in memory be larger than on disk? (i.e. why VirtualSize &gt; SizeOfRawData)</p>
  <p>One reason is zero-initialized data. For example, a global <code>char buffer[0x200];</code> declared outside any function needs <code>0x200</code> bytes in memory, initially containing zeros. There is no need to store all those zero bytes in the executable. The linker can describe the required space in the PE headers, and Windows provides the zero-filled memory when loading the image. This saves disk space.</p>
</aside>

Here, `SizeOfRawData` is `0x400`, while `VirtualSize` is `0x600`. So, the file contains `0x400` bytes for this section, but the section needs `0x600` bytes in memory. The loader fills the remaining `0x200` bytes with zeros.

There is another detail here. It is **alignment**. The Optional Header has a field named `SectionAlignment`, which specifies the alignment of section starts in memory. If it is `0x1000`, the section RVAs must be multiples of `0x1000`, such as `0x2000` and `0x3000`.

Let's use `SectionAlignment = 0x1000` with our example:

```text
RVA range          Contents
0x2000 - 0x23FF    0x400 bytes stored in the file
0x2400 - 0x25FF    0x200 bytes filled with zeros in memory
0x2600 - 0x2FFF    Space before the next aligned section
0x3000            Next section starts here in this example
```

Our section occupies `0x600` bytes, ending just before RVA `0x2600`. But `0x2600` is not a multiple of `0x1000`, so the next section cannot start there. The next aligned boundary is `0x3000`.

Let's assume our string starts `0x30` bytes into this section. Its location in each layout is:

```text
RVA:          0x2000 + 0x30 = 0x2030
File offset:  0x0600 + 0x30 = 0x0630
```

If the image is loaded at `0x00400000`, the string's VA is:

```text
VA:  0x00400000 + 0x2030 = 0x00402030
```

Okay, now we have three numbers describing the same string. A file offset, a VA and an RVA.

In a hex editor, we would go to file offset `0x0630`. In the loaded image, the string is at VA `0x00402030`. Its RVA is `0x2030`.

So to locate specific bytes in a hex editor, we can calculate the file offset like this:

```text
Offset within section = RVA - section VirtualAddress
File offset = section PointerToRawData + offset within section

0x0600 + (0x2030 - 0x2000) = 0x0630
```

So, we should not jump to file offset `0x2030` just because the RVA is `0x2030`.

![PE section layout comparing an RVA, a virtual address, and a file offset]({{ '/assets/images/aslr-pie-windows-relocations/09-rva-file-offset-layout.png' | relative_url }})

I know it was too much terminology. But here, the essence is knowing what VA, RVA, file offset, SizeOfRawData, and VirtualSize are, and what the differences between them are.

## Are These Addresses Really Locations in RAM?

Unfortunately, they are not. You can say: "We calculated the address of our string as `0x00402030`. But then what does this number actually refer to?"

Here, `0x00402030` is a **virtual address**. It belongs to the address space of our process. A **physical address**, the RAM-backed real address, identifies the location in physical memory to which that virtual address is translated. Each user-mode Windows process has its own virtual address space.

![The same virtual address in two processes mapped to different physical memory locations]({{ '/assets/images/aslr-pie-windows-relocations/10-process-address-isolation.png' | relative_url }})

The operating system manages the mappings, and the CPU's memory management unit, or **MMU**, performs the address translation using page tables. We can think of a page table as describing which physical page backs a virtual page, along with access permissions.

Let's use ordinary `0x1000`-byte pages, which are 4 KiB, for this example. Imagine that our process has this mapping:

```text
Virtual page start     Physical page start
0x00402000         ->  0x001A3000
```

Our string is `0x30` bytes into that page:

```text
Virtual address:   0x00402000 + 0x30 = 0x00402030
Physical address:  0x001A3000 + 0x30 = 0x001A3030
```

The offset within the page stays the same. The page mapping determines the physical page.

You may ask: "What happens if another process also uses `0x00402030`?"

That is possible. The same virtual address in two processes can translate to different physical locations:

```text
Process A:  VA 0x00402030 -> physical address 0x001A3030
Process B:  VA 0x00402030 -> physical address 0x007B9030
```

The address is interpreted in the context of the current process's mappings. So, the two programs do not automatically access the same byte just because their pointers contain the same number. Explicitly shared memory can use common physical pages, but equal virtual addresses alone do not establish sharing.

### How Can Two Processes Share the Same Memory?

You may ask: "If each process has its own address space, how can they share memory at all?"

Having separate address spaces does not require every virtual page to have a separate physical page. The operating system can map a shared memory region into both processes. Each process gets a virtual view of that region, while the underlying bytes are shared.

Let's imagine that the same shared page is mapped at different virtual addresses:

![Two processes mapping different virtual addresses to the same shared physical page]({{ '/assets/images/aslr-pie-windows-relocations/01-shared-physical-page.png' | relative_url }})

```text
Process A                              Process B
Virtual page: 0x01000000                Virtual page: 0x02000000
                  \                    /
                   \                  /
                    Shared physical page
                         0x001A3000
```

Now, look at the byte at offset `0x30` within that page:

```text
Process A:  0x01000000 + 0x30 = VA 0x01000030
Process B:  0x02000000 + 0x30 = VA 0x02000030

Both map to physical address:
            0x001A3000 + 0x30 = 0x001A3030
```

### Virtual Layout and Physical Placement

Also, consecutive virtual pages do not have to occupy consecutive physical pages. Our executable can have a continuous virtual layout while its physical pages are scattered in RAM.

![Consecutive virtual pages mapped to nonconsecutive physical pages in RAM]({{ '/assets/images/aslr-pie-windows-relocations/02-virtual-layout-physical-placement.png' | relative_url }})

Furthermore, virtual memory does not mean that every address has RAM behind it at every moment. Some pages can be temporarily nonresident, with their contents backed by a file on disk. The operating system can bring them into RAM when needed and update the mappings.

![A nonresident virtual page backed by a file and brought into RAM when needed]({{ '/assets/images/aslr-pie-windows-relocations/03-nonresident-page.png' | relative_url }})

Okay, now we know what kind of address we are working with. The `ImageBase`, VAs and RVAs from our previous examples describe the executable's virtual layout. They do not tell us its physical placement in RAM.

## Can We Know Where an Executable Will Be Loaded Before Running It?

From what we saw above, as you can guess, we cannot determine the executable's physical addresses just by inspecting its file before running it. The operating system chooses the physical mappings at runtime, depending on the current memory state. It can assign available physical pages or reuse pages that are already shared.

Okay, but what about the layout in the process's **virtual address space**? We already have an `ImageBase` and the RVAs of the sections. Can we use them to know the addresses before execution?

We can know the relative layout inside the executable image from its PE headers. For example, a string at RVA `0x2000` will be `0x2000` bytes above the actual image base. If the executable loads at its preferred base, our calculation works like this:

```text
Preferred image base:  0x00400000
String RVA:            0x00002000
String VA:             0x00402000
```

But can we assume that Windows will actually use that preferred base? Knowing the image's internal layout and knowing the actual virtual base address Windows uses at runtime are two different things. Yeah, we face another impediment that blocks us from understanding this topic. It is ASLR.

**ASLR** stands for **Address Space Layout Randomization**. At first it seems kinda complex, especially because of its name :)

It makes the locations of selected regions in a process's virtual address space less predictable. Depending on the operating system, binary and configuration, these regions can include executable images, shared libraries, the stack and the heap. We will talk about which regions are randomized below in more detail.

For now, we can visualize a movable executable like this:

![Two possible image base addresses under ASLR with the same internal layout]({{ '/assets/images/aslr-pie-windows-relocations/04-aslr-image-placement.png' | relative_url }})

```text
Virtual address layout          Virtual address layout
One possible placement           Another possible placement

0x00400000  image base           0x00500000  image base
      ...                             ...
0x00401100  an instruction       0x00501100  the same instruction
      ...                             ...
0x00402000  string              0x00502000  string
```

Notice that the distance from the image base to `message` is still `0x2000`. The operating system changes the image's virtual base address while preserving its internal relative layout. It does not shuffle individual instructions.

### Why the Heck Did People Invent ASLR?

Okay, we can move an executable to a different virtual base address. But why do we want to do this? Let's look at a stack buffer overflow and see where knowing an address becomes useful to an attacker.

Imagine a 32-bit x86 function with a local buffer and a conventional stack frame. Its stack can contain a layout like this:

![Conventional x86 stack frame showing the saved return address, saved base pointer, and local buffer]({{ '/assets/images/aslr-pie-windows-relocations/05-conventional-x86-stack-frame.png' | relative_url }})

```text
Higher addresses
    ...
    Saved return address
    Saved base pointer
    Local buffer and other local data
    ...
Lower addresses
```

If an attacker can find a way to write beyond the buffer's boundary, it may corrupt the saved return address.

The return address tells the CPU where to continue execution after the function finishes.

If the saved return address has been corrupted and execution reaches `ret` without a protective check stopping it, the CPU attempts to continue at the corrupted address. The buffer error has now affected the program's control flow.

An attacker trying to exploit this situation needs more than a changed number. The destination must refer to code that serves the attacker's purpose. Merely corrupting the address often crashes the process. So the attacker needs the virtual addresses of the instructions it wants to execute.

Let's use the same kind of image calculation we used above. Imagine an instruction at RVA `0x1100`:

```text
Image base          Instruction RVA     Instruction VA
0x00400000          0x1100              0x00401100
0x00500000          0x1100              0x00501100
```

The instruction is still at the same RVA, but its virtual address changes with the image base. A destination address learned from the first placement no longer identifies that instruction in the second placement.

So, people invented ASLR to make the virtual addresses of the instructions harder to guess.

Of course there are other security features that prevent an attacker from using buffer overflows in this way, like stack cookies, DEP, etc. But these are the topic of another blog.

But wait, now we are loading the executable at a random virtual base address. The instructions that include fixed addresses we saw above will be broken. How can we fix them?

One way to handle this is to avoid embedding fixed addresses wherever possible.

## Relative Addressing

**Relative addressing** means specifying a target address as an offset from a reference address. In other words, instead of storing a complete address, an instruction can describe a distance from another location.

For example, on x86-64, we have **RIP-relative addressing**. `RIP` is the instruction pointer. In this addressing mode, the reference point is the address of the next instruction.

Here is an example. Below is an instruction that calculates an address using an offset of `0xFF9`:

```asm
lea     rax, [rip + 0xFF9]
```

Here, the instruction contains the offset `0xFF9`, rather than the complete target address.

Let's assume this instruction starts at `0x00401000` and is seven bytes long:

![RIP-relative addressing calculating a target from the next instruction address and displacement]({{ '/assets/images/aslr-pie-windows-relocations/06-rip-relative-addressing.png' | relative_url }})

```text
Next instruction:  0x00401007
Target address:    0x00402000

Displacement:
0x00402000 - 0x00401007 = 0xFF9
```

Now, suppose the image is loaded at a virtual base address `0x00100000` higher:

![The same RIP-relative displacement reaching the target after the image is rebased]({{ '/assets/images/aslr-pie-windows-relocations/07-rip-relative-after-rebase.png' | relative_url }})

```text
Next instruction:  0x00501007
Target address:    0x00502000

Address calculation:
0x00501007 + 0xFF9 = 0x00502000
```

The same displacement works. Both locations moved by the same amount, so the distance between them stayed the same.

## Two Problems Relative Addressing Can't Address

Okay, relative addressing worked in our example. But is it enough to make an entire program position independent?

Not by itself. Our example worked because the instruction and its target moved together. Let's look at two situations where that is not enough, and how the compiler, linker and loader handle them.

### 1. The Target Can Live in Another Module

Now, imagine that our executable needs to call a function in a shared library. The executable and the library can be loaded at independently chosen virtual base addresses, so the distance between them can change. A fixed displacement directly from our instruction to that function would no longer be reliable.

We can solve this with an extra step. Instead of encoding a fixed distance directly to that function, our code can access an entry in an address table within its own image. The loader or runtime linker puts the function's runtime virtual address into that entry. Our code reads that address and uses it for the call.

![Relative addressing reaching a table entry that contains an external function address]({{ '/assets/images/aslr-pie-windows-relocations/08-external-module-address-table.png' | relative_url }})

Now we have two steps. Relative addressing gets us to the table entry, which moves together with our code. The address stored in that entry gets us to the function, wherever its library was loaded.

### 2. The Address Can Hide in Data (Pointer)

There is another detail we can miss. Addresses can also be stored in data, and we call them pointers. For example, think about a table that contains the pointer `0x00402000`. We can use RIP-relative addressing to find the table, but that does not change the pointer stored inside it. If the image moves, that stored address still needs attention.

Let's make this concrete. Suppose the target is an integer containing `42`, located at offset `0x2000` from the image base:

```text
Image base:          0x00400000
Target's offset:     0x00002000
Target's VA:         0x00402000
```

If the image is loaded at `0x00500000` instead, the integer will be at `0x00502000`. But a table entry containing `0x00402000` would still point to its old location. For a stored pointer that needs a load-time correction, the build tools and loader handle this through **relocation**.

But how does the loader know which values are addresses? Let's imagine our table also has a second entry containing an ordinary number. Both entries happen to contain the same bytes:

```text
First entry:   0x00402000    address of our integer
Second entry:  0x00402000    an ordinary number
```

The difference is known when the program is built. In the source, the first entry is initialized with the integer's address; the second is initialized with a numeric constant. The compiler passes that distinction to the linker. For the first entry, the linker writes a **relocation record** into the executable. The record identifies the entry that needs correction and the operation to apply.

When the loader places the image at `0x00500000`, it follows that record and corrects the first entry. The second entry has no relocation record, so its value stays unchanged:

```text
                         Before correction    After correction
First entry (address):   0x00402000           0x00502000
Second entry (number):   0x00402000           0x00402000
```

![A relocation updating a stored pointer while leaving an ordinary number unchanged]({{ '/assets/images/aslr-pie-windows-relocations/11-pointer-versus-number-relocation.png' | relative_url }})

We will see how that works in a more concrete way in the next section.

After all this trouble, we have an executable that can work at different virtual base addresses. In the ELF/Linux context, an executable built to support this is called a **Position Independent Executable**, or **PIE**. PIE describes the executable's ability to work at different load addresses. But in this blog, we will follow a Windows example and describe it as an **ASLR-capable PE image**.

Below we discuss the relationship between **an executable's ability to load at different virtual base addresses** and **ASLR's randomization of those addresses**. This distinction applies to both Windows and Linux, although the terminology differs between platforms.

<aside class="blog-note" aria-label="Note: Then, what is the difference between PIE and ASLR?">
  <p class="blog-note__title">Note &middot; Then, what is the difference between PIE and ASLR?</p>
  <p>PIE means the executable is built to keep working when loaded at different virtual base addresses. It does not choose the base address itself. For example, it could work at either <code>0x00400000</code> or <code>0x00500000</code>. Even if the loader always chose <code>0x00400000</code>, it would still be a PIE.</p>
  <p>ASLR is the operating system mechanism that introduces randomness into the choice of load addresses. For a PIE, ASLR can choose a randomized load address, and the executable is built to keep working at that address.</p>
  <p>In short, PIE is a property of the executable, while ASLR is an operating system mechanism that randomizes its placement in virtual memory.</p>
</aside>

<aside class="blog-note" aria-label="Note: Then, What Happens if ASLR Is Enabled but the Executable Is Non-PIE?">
  <p class="blog-note__title">Note &middot; Then, What Happens if ASLR Is Enabled but the Executable Is Non-PIE?</p>
  <p>ASLR cannot simply move an executable that depends on fixed addresses and has no supported way to correct those references. For a traditional fixed-address non-PIE ELF executable, the main image stays at its expected virtual addresses. For example, its base could remain <code>0x00400000</code> across launches, even with ASLR enabled.</p>
  <p>That does not mean the entire process has a fixed layout. The stack, heap and separately loaded libraries can still have randomized addresses, depending on the operating system's policy.</p>
</aside>

## Let's Make It Concrete

Okay, we have moved imaginary addresses around for long enough. Let's build an executable and follow the actual bytes.

We will compile a small C program as an x86-64 Windows PE executable.

The values below come from a binary built with MSVC 19.51 on Windows. Your compiler may choose different offsets. That is fine.

Here is the complete program. I saved it as `example.c`:

```c
#include <stdio.h>

int number = 42;
int *pointer = &number;
int ordinary_number = 42;
unsigned char zeroed[0x2000];

int main(void)
{
    int local_number = 7;

    puts("Let's look at our addresses.");
    printf("number address:   %p\n", (void *)&number);
    printf("pointer address:  %p\n", (void *)&pointer);
    printf("pointer value:    %p\n", (void *)pointer);
    printf("values:           %d / %d / %d\n", number, *pointer, ordinary_number);
    printf("zeroed address:   %p\n", (void *)zeroed);
    printf("zeroed first byte: %u\n", (unsigned)zeroed[0]);
    printf("stack address:    %p\n", (void *)&local_number);

    return 0;
}
```

Let's go through the parts we want to follow in the executable.

**1. An integer and a pointer to it**

`number` contains `42`. `pointer` contains the address of `number`. Because both are global variables, their storage belongs to the executable image file.

`&pointer` tells us where the pointer itself is stored. `pointer` tells us which address is stored inside it. These are different things, so we print both. The printed pointer value should match `&number`.

**2. An ordinary value beside an address**

`ordinary_number` also contains `42`, but it is just an integer. When the image's addresses change, this value should stay the same. We will look for a relocation affecting the stored pointer and compare it with this ordinary integer.

**3. A buffer that starts with zeros**

The global `zeroed` array reserves `0x2000` bytes. Without an explicit initializer, its elements start at zero. It gives us something to locate in the section whose memory size is larger than its stored file data. The program prints its address and first byte.

**4. Addresses from different parts of the process**

`local_number` lives in the current stack frame, while the globals live in the executable image. `puts` is an external library function. Its call gives us an import to follow in the PE.

The program prints virtual addresses and the values we read. We will inspect the image base separately in the executable's headers and, for its actual loaded base, in a debugger.

### PE File

Let's build an x86-64 PE from an **x64 Native Tools Command Prompt for Visual Studio**:

```bat
cl /nologo /W4 /Od /Zi /MD /Fe:example.exe example.c /link /DYNAMICBASE /HIGHENTROPYVA /FIXED:NO /INCREMENTAL:NO /MAP:example.map
```

<aside class="blog-note" aria-label="For the Curious: What Do All These Switches Do?">
  <p class="blog-note__title">For the Curious &middot; What Do All These Switches Do?</p>
  <p>That is quite a long command for such a small program :) Let's unpack it. <code>cl</code> runs the MSVC compiler, and <code>example.c</code> is our input file. The switches control how it builds the executable:</p>
  <table>
  <thead>
  <tr>
  <th>Switch</th>
  <th>What it does and why we use it</th>
  </tr>
  </thead>
  <tbody>
  <tr>
  <td><code>/nologo</code></td>
  <td>Hides the compiler's startup banner to keep the output shorter.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/compiler-option-warning-level"><code>/W4</code></a></td>
  <td>Enables warning levels 1 through 4, giving us more feedback about possible mistakes in the source.</td>
  </tr>
  <tr>
  <td><code>/Od</code></td>
  <td>Disables compiler optimization, making the generated instructions easier to relate to our C code.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/z7-zi-zi-debug-information-format"><code>/Zi</code></a></td>
  <td>Generates debug information in PDB files, including function and variable names and source-line information for the debugger.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/md-mt-ld-use-run-time-library"><code>/MD</code></a></td>
  <td>Uses the DLL version of the C runtime. Calls such as <code>puts</code> give us an external function reference to inspect.</td>
  </tr>
  <tr>
  <td><code>/Fe:example.exe</code></td>
  <td>Names the output executable <code>example.exe</code>.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/link-pass-options-to-linker"><code>/link</code></a></td>
  <td>Passes the remaining switches to the linker. The linker combines the compiled code and libraries into our executable.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/dynamicbase-use-address-space-layout-randomization"><code>/DYNAMICBASE</code></a></td>
  <td>Marks the image as supporting ASLR, allowing Windows to randomize its virtual base address.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/highentropyva-support-64-bit-aslr"><code>/HIGHENTROPYVA</code></a></td>
  <td>Marks our 64-bit image as supporting a wider range of randomized virtual addresses. It works together with <code>/DYNAMICBASE</code>.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/fixed-fixed-base-address"><code>/FIXED:NO</code></a></td>
  <td>Tells the linker to generate base relocation information so the loader can adjust addresses when the image moves.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/incremental-link-incrementally"><code>/INCREMENTAL:NO</code></a></td>
  <td>Performs a full link instead of an incremental one. This avoids the extra padding and jump thunks that incremental linking can add, making the binary easier to follow.</td>
  </tr>
  <tr>
  <td><a href="https://learn.microsoft.com/en-us/cpp/build/reference/map-generate-mapfile"><code>/MAP:example.map</code></a></td>
  <td>Writes a text map of the image's sections and public symbols to <code>example.map</code>, helping us locate our functions and globals.</td>
  </tr>
  </tbody>
  </table>
  <p>We can also look at the <a href="https://learn.microsoft.com/en-us/cpp/build/reference/compiler-options-listed-alphabetically">compiler options reference</a> to learn more.</p>
</aside>

Now let's open `example.exe` in DiE and follow the file we actually built.

First, let's look at the Optional Header:

![DiE Optional Header showing the preferred image base and section and file alignment]({{ '/assets/images/aslr-pie-windows-relocations/pe-optional-header.png' | relative_url }})

Our `ImageBase` is `0x140000000`. As we discussed earlier, this is the preferred **virtual** base address. It tells us where the image was built to live. We have opened a file on disk, so we have not yet observed where Windows actually loads it.

We can also see `SectionAlignment = 0x1000` and `FileAlignment = 0x200`. Section starts in the loaded image are aligned to `0x1000`-byte boundaries. The section data in the file uses `0x200`-byte alignment. Let's keep those values in mind when we compare the two layouts below.

The same header contains `DllCharacteristics = 0x8160`. Despite its name, this field also applies to our executable. Opening its Flags menu gives us something easier to read:

![DiE DllCharacteristics flags with DYNAMIC_BASE and HIGH_ENTROPY_VA enabled]({{ '/assets/images/aslr-pie-windows-relocations/pe-aslr-flags.png' | relative_url }})

`DYNAMIC_BASE` is checked. This is the flag set by [`/DYNAMICBASE`](https://learn.microsoft.com/en-us/cpp/build/reference/dynamicbase-use-address-space-layout-randomization), marking the image as supporting ASLR. `HIGH_ENTROPY_VA` is checked too. So our 64-bit image supports the wider range of randomized virtual addresses described by [`/HIGHENTROPYVA`](https://learn.microsoft.com/en-us/cpp/build/reference/highentropyva-support-64-bit-aslr).

Now let's open the section table and look at `.data`:

![DiE section table showing the data section RVA, file offset, raw size, and virtual size]({{ '/assets/images/aslr-pie-windows-relocations/pe-sections.png' | relative_url }})

| Field              | Value    | Meaning                                                                                                    |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `VirtualAddress`   | `0x5000` | The section starts at RVA `0x5000` in the loaded image (again this is an RVA, despite the field name).     |
| `PointerToRawData` | `0x2E00` | Its stored bytes start at file offset `0x2E00`.                                                            |
| `SizeOfRawData`    | `0x200`  | The file contains `0x200` bytes for this section, including any file-alignment padding.                    |
| `VirtualSize`      | `0x2250` | The section occupies `0x2250` bytes in the loaded image, before rounding its extent for section alignment. |

If Windows loaded the image at its preferred base, `.data` would start at:

```text
0x140000000 + 0x5000 = 0x140005000
```

At another loaded base, we would add the same RVA to that base instead.

The size difference gives us a real example of the zero-filled tail we discussed earlier:

```text
File offsets 0x2E00–0x2FFF -> RVAs 0x5000–0x51FF: 0x0200 stored bytes
No corresponding file bytes -> RVAs 0x5200–0x724F: 0x2050 zero-filled bytes (0x2250 - 0x200 = 0x2050)
```

The next section, `.pdata`, starts at RVA `0x8000`. Notice how `0x5000 + 0x2250 = 0x7250` rounds up to `0x8000` with our `0x1000` section alignment.

Okay, but which addresses belong to our variables? The section table does not name individual C variables. Our generated `example.map` provides that connection.

<aside class="blog-note" aria-label="Note: What Is a .map File?">
  <p class="blog-note__title">Note &middot; What Is a <code>.map</code> File?</p>
  <p>A map file is a plain-text report produced by the linker when it builds a program. It describes the layout and lists symbols, such as function and global-variable names, alongside their locations. This gives us a way to connect a name in our C code to a location in the executable.</p>
  <p>In our MSVC build, <code>/MAP:example.map</code> asks the linker to write this report to <code>example.map</code>. We can open it in any text editor. Microsoft's <a href="https://learn.microsoft.com/en-us/cpp/build/reference/map-generate-mapfile"><code>/MAP</code> documentation</a> describes its contents.</p>
  <img src="{{ '/assets/images/aslr-pie-windows-relocations/pe-map-file.png' | relative_url }}" alt="MSVC map file listing global variables and their addresses at the preferred image base" loading="lazy">
  <p>The <code>Rva+Base</code> column uses the preferred image base. For example, it lists <code>pointer</code> at <code>0x140005008</code>. Subtracting our preferred base, <code>0x140000000</code>, gives RVA <code>0x5008</code>. If ASLR selects another base when the program runs, we add that loaded base to the RVA to find the variable's runtime virtual address.</p>
</aside>

Let's look at our variables from the `example.map` file.

| Variable          | RVA      | Virtual address at the preferred base |
| ----------------- | -------- | ------------------------------------- |
| `number`          | `0x5000` | `0x140005000`                         |
| `ordinary_number` | `0x5004` | `0x140005004`                         |
| `pointer`         | `0x5008` | `0x140005008`                         |
| `zeroed`          | `0x5240` | `0x140005240`                         |

For example, the storage for `pointer` is eight bytes into `.data`. Its file offset is:

```text
Offset within .data: 0x5008 - 0x5000 = 0x8
File offset:        0x2E00 + 0x8 = 0x2E08
```

`zeroed` is different. Its offset within `.data` is `0x240`, which exceeds the section's `0x200` stored bytes. Its RVA is valid, but it has no corresponding file offset. Calculating `0x2E00 + 0x240 = 0x3040` would take us into another part of the file, not to the array.

Now, let's inspect the bytes stored in `pointer` and find the relocation record for that field.

We have calculated where `pointer` is stored. Now let's look at what is stored there. In DiE's Hex view, the eight selected bytes start at file offset `0x2E08`:

![DiE Hex view showing the eight bytes of the stored pointer at file offset 0x2E08]({{ '/assets/images/aslr-pie-windows-relocations/pe-pointer-bytes.png' | relative_url }})

```text
File offset:  0x2E08
Stored bytes: 00 50 00 40 01 00 00 00
64-bit value: 0x0000000140005000
```

Remember little-endian order? Reading those bytes as a 64-bit value gives us `0x140005000`, the address of `number` at the preferred base. The pointer itself lives at RVA `0x5008`; the address inside it points to RVA `0x5000`, which is where `number` is.

If the image moves, that stored address needs to change. Okay, but where is the record telling Windows to change it?

Let's select `.reloc` in the section table and look at its bytes:

![DiE Hex view showing the base relocation table in the reloc section]({{ '/assets/images/aslr-pie-windows-relocations/pe-base-relocations.png' | relative_url }})

In this file, `.reloc` starts at file offset `0x3400`. The table groups relocations into blocks for 4 KB (0x1000) RVA pages. Each block starts with a four-byte **Page RVA** and a four-byte **Block Size**, followed by two-byte entries. Block Size includes the header and entries. Microsoft describes this layout in its [base relocation documentation](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#base-relocation-block).

Our pointer is at RVA `0x5008`, which falls within the `0x5000–0x5FFF` page. Let's find the block whose Page RVA is `0x5000`.

The first block's header, at file offset `0x3400`, is:

```text
00 30 00 00 | 2C 00 00 00
Page RVA      Block Size
0x3000        0x2C
```

That block covers another RVA page. Its size tells us exactly where to look next:

```text
Next block's file offset: 0x3400 + 0x2C = 0x342C
```

At `0x342C`, we find:

![Selected relocation block for page RVA 0x5000 with the DIR64 entry targeting RVA 0x5008]({{ '/assets/images/aslr-pie-windows-relocations/pe-relocation-block-selected.png' | relative_url }})

```text
00 50 00 00 | 0C 00 00 00 | 08 A0 | 00 00
Page RVA      Block Size   Entry   Padding
0x5000        0x0C
```

There is our page! The `0x0C`-byte block occupies file offsets `0x342C–0x3437`. Its first entry starts after the eight-byte header, at `0x3434`.

The entry bytes are `08 A0`. Reading them in little-endian order gives `0xA008`. We then split that 16-bit value into a four-bit type and a twelve-bit offset (as mentioned in [Microsoft documentation](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#base-relocation-block)):

```text
Bytes in the file: 08 A0
16-bit value:     0xA008

Binary:           1010 | 0000 0000 1000
                  Type       Offset
                  0xA        0x008
```

Type `0xA` (decimal `10`) means **DIR64**, adjust the 64-bit field. The offset identifies that field within the block's RVA page:

```text
Target RVA: 0x5000 + 0x008 = 0x5008
```

![A DIR64 relocation entry split into its type and offset to identify the pointer field]({{ '/assets/images/aslr-pie-windows-relocations/12-dir64-relocation-entry.png' | relative_url }})

Yes, surprisingly this is where `pointer` is stored :)

Now we can connect the two screenshots. At file offset `0x2E08`, we saw an address stored in our data. The relocation entry at file offset `0x3434` identifies that data field by its RVA, `0x5008`, and tells the loader how to adjust it.

For DIR64, the loader adds the difference between the actual loaded virtual base and the preferred base to the stored address. If the image moves upward by `0x100000`, the pointer changes from `0x140005000` to `0x140105000`, where `number` moved too.

What about `ordinary_number` at RVA `0x5004`? There will be no relocation targeting it. If we had another global pointer initialized with `&ordinary_number`, that pointer would also need a relocation to update its stored address when the image moves.

Now let's follow the assembly instructions that use these addresses. Our map file places `main` at RVA `0x1000`, or VA `0x140001000` at the preferred base. We can disassemble this executable with:

```bat
dumpbin /disasm /nopdb example.exe
```

[`/DISASM`](https://learn.microsoft.com/en-us/cpp/build/reference/disasm) prints the instructions, and [`/NOPDB`](https://learn.microsoft.com/en-us/cpp/build/reference/nopdb) skips PDB symbol lookup to show virtual addresses instead of labels.

This instruction reads the integer stored in `number`:

```text
0000000140001063: 8B 15 97 3F 00 00  mov         edx,dword ptr [0000000140005000h]
```

Although dumpbin shows `[0000000140005000h]`, the instruction uses **RIP-relative addressing**. Dumpbin has calculated the target address for us. The same bytes, `8B 15 97 3F 00 00`, appear in objdump with the RIP-relative operand shown explicitly:

```asm
mov edx, DWORD PTR [rip+0x3f97]   # 0x140005000
```

These are two displays of the same machine instruction. The full address `0x140005000` is not stored in its bytes. The displacement bytes `97 3F 00 00` represent `0x3F97`, and the addressing mode tells the CPU to add that displacement to the next instruction's virtual address.

Our instruction starts at `0x140001063` and is six bytes long, so the next instruction starts at `0x140001069`:

```text
Next instruction VA + displacement:
0x140001069 + 0x3F97 = 0x140005000
```

If the image moves, the instruction and `number` move together, so the same displacement still works.

For `*pointer`, we have two instructions:

```text
0000000140001059: 48 8B 05 A8 3F 00  mov         rax,qword ptr [0000000140005008h]
                  00
0000000140001060: 44 8B 00           mov         r8d,dword ptr [rax]
```

The first instruction follows the same pattern. Dumpbin shows the calculated address `[0000000140005008h]`, the RIP-relative operand is `[rip+0x3FA8]`. It finds the pointer field with:

```text
Next instruction VA + displacement:
0x140001060 + 0x3FA8 = 0x140005008
```

It reads the eight-byte address stored there into `rax`. At the preferred base, that address is `0x140005000`. What happens if the image moves? Do you remember the relocation we discussed above? Yes, the relocation prepares the pointer's value for the new base. So two mechanisms cooperate. RIP-relative addressing finds the pointer field, and the base relocation corrects the address inside it.

![RIP-relative addressing locating a relocated pointer before dereferencing it]({{ '/assets/images/aslr-pie-windows-relocations/13-reading-through-relocated-pointer.png' | relative_url }})

The second instruction reads four bytes from the address now in `rax`, obtaining `42`. This is the dereference. We first read an address from `pointer`, then read the integer at that address.

Let's move to the `puts` call.

Near the beginning of `main`, we find:

```text
0000000140001013: FF 15 57 21 00 00  call        qword ptr [0000000140003170h]
```

Again, dumpbin shows the calculated target. The underlying memory operand is `[rip+0x2157]`. The address `0x140003170` identifies the Import Address Table slot for `puts`, which the six-byte instruction reaches with:

```text
Next instruction VA + displacement:
0x140001019 + 0x2157 = 0x140003170

IAT slot RVA: 0x3170
```

The map file confirms `__imp_puts` at VA `0x140003170`.

```text
0002:00000170       __imp_puts                 0000000140003170     ucrt:api-ms-win-crt-stdio-l1-1-0.dll
```

During loading, Windows resolves the import and writes the function's runtime virtual address into the IAT slot. The `call` reads that address from the slot and calls the function.

The logic is nearly the same as the things we discussed above. The instruction has a fixed distance to a slot inside its own image. The slot holds the resolved address needed to reach the external function. This is the extra step we discussed for references to another module.

Okay, let's run `example.exe` and see what happened to our addresses.

During our repeated runs, the global variables kept appearing at the same virtual addresses, while the stack address changed. Does that mean ASLR was disabled? A repeated image base alone does not tell us that. In our experiment, restarting Windows gave us a different placement for the image.

Here is one run before the restart:

![Program output showing global variable, pointer, and stack addresses before restarting Windows]({{ '/assets/images/aslr-pie-windows-relocations/pe-runtime-first-boot.png' | relative_url }})

And here is the run after restarting Windows:

![Program output showing global variable, pointer, and stack addresses after restarting Windows]({{ '/assets/images/aslr-pie-windows-relocations/pe-runtime-after-restart.png' | relative_url }})

These outputs show the addresses of our variables, rather than the image base itself. But we already know that `number` has RVA `0x5000`, so we can work backward:

```text
Loaded image base = number's runtime VA - number's RVA

Before restarting:
0x00007FF709795000 - 0x5000 = 0x00007FF709790000

After restarting:
0x00007FF68DA65000 - 0x5000 = 0x00007FF68DA60000
```

Both bases differ from the preferred `ImageBase`, `0x140000000`, and they differ from each other. The image moved to a different location in the process's virtual address space.

Now look at `pointer address` and `pointer value`. Remember, the first tells us where the pointer is stored, the second tells us which address it contains.

| Value                       | Before restarting    | After restarting     |
| --------------------------- | -------------------- | -------------------- |
| `number`'s VA               | `0x00007FF709795000` | `0x00007FF68DA65000` |
| `pointer`'s VA              | `0x00007FF709795008` | `0x00007FF68DA65008` |
| Address stored in `pointer` | `0x00007FF709795000` | `0x00007FF68DA65000` |

On disk, that pointer contained `0x140005000`. In each loaded image, it contains the correct runtime virtual address of `number`. This is the result of applying the base relocation we discussed earlier!

The positions inside the image stayed the same. `number` is still at RVA `0x5000`, `pointer` at `0x5008`, and `zeroed` at `0x5240`. All three integers on the `values` line are `42`, and `zeroed first byte` is `0`, just as we expected.

The stack address also changed, but the stack has its own placement. It does not move as part of the executable image.

I can almost hear you saying, "Uh, that was quite complicated." I felt the same way while writing it :) Feel free to read it again. There are a lot of moving parts here, so needing another pass is perfectly normal.

I don't know how many times you've read this, but thanks for every read. See you later...
