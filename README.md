
# FUS

## Intro

Minimalist programming language.
Only knows how to create and modify data structures, which can be easily traversed by C code.

* [List of keywords](/keywords.md)

* [Definition of keywords and opcodes](/src/symcodes.inc)

* [Implementation of opcodes](/src/state_step.c)

* [Example programs and utility libraries](/fus/)


## Getting started

Compile:

    ./compile   # basically just 'gcc -o main src/*.c'

Run:

    ./main  # runs ./test.fus by default

    ./main -f fus/heap.fus  # run a different file

    ./main -c '1 2 + 3 * p'  # run code directly

    ./main -c 'load(fus heap) @(heap test)'  # load and use another file

