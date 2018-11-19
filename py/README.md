
# The "fus" Python module

## Compiling

Just use the "py" compilation target of compile script:

    # Should generate py/fus.so
    ./compile py

You could also try ``./setup.py install`` from within the repo's [/pypi](/pypi) subdirectory.


## Running

If all goes well with compilation, try:

    PYTHONPATH=./py:$PYTHONPATH python

Now let's run some fus from within Python:

    from fus import run

    # NOTE: The fus module maintains fus state (defs+stack+vars)

    run(r'"Hello!\n"' " ='msg")
    run("'msg str_p")
    # Prints: Hello!

    run('def add_and_print of(x y ->): + p')
    run('1 2 +')
    run('10 @add_and_print')
    # Prints: 13

    run('asd')
    # Raises RuntimeError
