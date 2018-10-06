
# FUS

## Intro

Minimalist programming language.
Only knows how to create and modify data structures, which can be easily traversed by C code.

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
    # runs ./test.fus by default (just little tests of whatever I'm working on at the moment)

    ./main -f fus/tests.fus
    # run a different file (the full test suite, in this case)

    ./main -c '1 2 + 3 * p'
    # run code directly (do some math and print the result)

    ./main -c 'load(fus heap) @(heap test)'
    # load and use another file (fus/heap.fus in this case) and calling a function from it

    ./main -c 'load(fus heap) use(heap test) @test'
    # like "using heap::test;" in C++, or "from heap import test" in Python

