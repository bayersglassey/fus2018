
# Fus

It's a little programming language!

I have embedded it in Python, and uploaded it to PyPi to see how that's done.


## Getting Started

Try the following:

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

