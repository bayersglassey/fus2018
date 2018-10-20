
# FUS

## Intro

Minimalist programming language.
Only knows how to create and modify data structures, which can be easily traversed by C code.

All values behave as if immutable.
Behind the scenes, mutable values with copy-on-write semantics are guaranteed,
making it possible to write performant purely functional programs
without a fancy type system. In theory.

TODO: Fight Haskell and win.

* [Example programs and utility libraries](/fus/)


## Example

    gen:
        0 ='a
        1 ='b
        do:
            'a out
            ''a 'b + ='c
            ''b ='a
            ''c ='b
            loop
    ='fibonacci_generator

    # Test it:
    'fibonacci_generator
        >> 0 == assert
        >> 1 == assert
        >> 1 == assert
        >> 2 == assert
        >> 3 == assert
        >> 5 == assert
        >> 8 == assert
    drop


## "Newvalues" Test Suite

A revamp of the basic datastructure for fus values is under way.
Previously they were a struct; now they are a tagged pointer.

Compile:

    ./compile_newvalues

Run:

    ./main


## Getting started

Compile:

    ./compile   # basically just 'gcc -o main src/*.c'

Run:

    ./main
    # runs ./test.fus

    ./main -f fus/heap.fus
    # run a different file (fus/heap.fus in this case)

    ./main -c '1 2 + 3 * p'
    # run code directly (do some math and print the result)

    ./main -c 'load(fus heap) @(heap test)'
    # load and use another file (fus/heap.fus in this case) and calling a function from it

    ./main -c 'load(fus heap) use(heap test) @test'
    # like "using heap::test;" in C++, or "from heap import test" in Python

