
# FUS example code

A nice small Fus example is [format.fus](/fus/format.fus), which generates
a formatted string from an array.

Example usage:

    load: fus format
    use: format simple format

    def say_hello of(name ->):
        ='name
        arr
            "Hello, ",
            'name,
            "!\n",
        @format str_p


A more complicated example is [sql.fus](/fus/sql.fus), which shows how a Fus
[ORM](https://en.wikipedia.org/wiki/Object-relational_mapping) might work.

Another good file would be [tests.fus](/fus/tests.fus), which asserts the intended
behaviour of just about every feature in the language.
