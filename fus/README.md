
# FUS example code

Perhaps the best file in here for learning about Fus is [format.fus](/fus/format.fus).

Example usage::

    load: fus format
    use: format format

    sig(s ->)
    def say_hello:
        ='name
        arr
            "Hello, ",
            'name,
            "!\n",
        @format str_p


Another good file would be [tests.fus](/fus/tests.fus), which asserts the intended
behaviour of just about every feature in the language.
