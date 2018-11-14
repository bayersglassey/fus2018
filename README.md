
# FUS

## Intro

Minimalist programming language.
Only knows how to create and modify data structures, which can be easily traversed by C code.

All values behave as if immutable.
Behind the scenes, mutable values with copy-on-write semantics are guaranteed,
making it possible to write performant purely functional programs
without a fancy type system. In theory.

TODO: Fight Haskell and win.

* [Example](#example)

* [Getting Started](#getting-started)

* [UWSGI plugin](#uwsgi-plugin)


## Example

    module fibonacci_generator:

        def test of(->):
            # Test basic generator behaviour

            @new
            dup @cur_index  0 == assert
            dup @cur_value  0 == assert
            @pop  0 == assert
            @pop  1 == assert
            @pop  1 == assert
            @pop  2 == assert
            @pop  3 == assert
            @pop  5 == assert
            @pop  8 == assert
            @pop 13 == assert
            dup @cur_index  8 == assert
            dup @cur_value 21 == assert
            drop

        def test_cache of(->):
            # The cache should let us do lookups of arbitrary indices

            @new
            # First call to @get does the calculations:
            7 @get 13 == assert
            # Second call to @get does a quick array lookup:
            7 @get 13 == assert
            drop

        def new of(-> gen):
            obj
                0 =.i
                0 =.a
                1 =.b

                # The cache starts off containing a and b:
                arr 0, 1, =.cache

        def cur_index of(gen -> i): .i
        def cur_value of(gen -> val): .a

        def next of(gen -> gen):
            ='gen

            # Get variables from object members:
            'gen .a ='a
            'gen .b ='b

            # Calculate next number in the sequence:
            ''a 'b + ='c

            # Return modified generator:
            ''gen

                # Increment the index:
                ..i 1 + =.i

                # Push newest value onto the "cache" array:
                ..cache 'c, =.cache

                ''b =.a
                ''c =.b

        def pop of(gen -> gen val):
            dup @cur_value ='val
            @next
            ''val

        def get of(gen i -> gen val):
            # Get "i"th value of Fibonacci sequence

            ='i ='gen
            do:
                # Loop while the requested index is not yet in cache:
                'i ('gen .cache len) >= while
                ''gen @next ='gen
                loop

            # Quick lookup now that index is within cache:
            'gen .cache 'i .$ ='val

            # Return:
            ''gen ''val

        # Run tests when module is loaded:
        @test


## Getting Started

A revamp of the basic datastructure for fus values is under way.
Previously they were a struct; now they are a tagged pointer.

The old runtime is in [src/*.[ch]](/src) and [src/main/*.c](/src/main).

The new runtime is in [src/newvalues/*.[ch]](/src/newvalues) and [src/newvalues/main/*.c](/src/newvalues/main).

Example fus programs are in [fus/*.fus](/fus),
but many don't work with the new runtime yet.

Tests which work with the new runtime are in [test/*.fus](/test).

Compile & Run Test Suite:

    ./compile_newvalues test && ./main

Compile & Run Parser:

    # Parse a fus file:
    ./compile_newvalues parse && ./main fus/sql.fus

    # With ANSI colors!
    ./compile_newvalues parse -DFUS_COLOR && ./main fus/sql.fus

Compile & Run "Runner":

    # Parse and execute a fus file:
    ./compile_newvalues run && ./main fus/fib.fus

Compile & Run "Runner" on all test files in repo root:

    # Roughly equivalent to:
    #     ./compile_newvalues run && ./main test/*.fus
    # ...except that ./main doesn't actually accept that syntax.
    ./run_test_files

Run all tests:

    # Roughly equivalent to:
    #     ./compile_newvalues test && ./main && ./run_test_files
    ./runtests



## UWSGI plugin

What use is a language which can't be used as a web server?

Step 1: [Write a plugin](/uwsgi) for [UWSGI](https://uwsgi-docs.readthedocs.io/en/latest/)

Step 2: [Write a web app](/fus/webapp_simple.fus)

Possible next steps:

* Generate HTML

* Write a [Redis](https://redis.io/) client

* Hook into more UWSGI features, like shared memory, caching, etc

