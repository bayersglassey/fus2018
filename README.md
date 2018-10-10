
# FUS

## Intro

Minimalist programming language.
Only knows how to create and modify data structures, which can be easily traversed by C code.

All values behave as if immutable.
Behind the scenes, mutable values with copy-on-write semantics are guaranteed,
making it possible to write performant purely functional programs
without a fancy type system. In theory.

TODO: Fight Haskell and win.

TODO: Add documentation. Links to source code don't count. :(

* [List of keywords](/keywords.md)

* [Definition of keywords and opcodes](/src/symcodes.inc)

* [Implementation of opcodes](/src/state_step.c)

* [Example programs and utility libraries](/fus/)


## Getting started

Compile:

    ./compile   # basically just 'gcc -o main src/*.c'

Run:

    ./main
    # runs ./test.fus

    ./main -f fus/tests.fus
    # run a different file (the full test suite, in this case)

    ./main -c '1 2 + 3 * p'
    # run code directly (do some math and print the result)

    ./main -c 'load(fus heap) @(heap test)'
    # load and use another file (fus/heap.fus in this case) and calling a function from it

    ./main -c 'load(fus heap) use(heap test) @test'
    # like "using heap::test;" in C++, or "from heap import test" in Python

