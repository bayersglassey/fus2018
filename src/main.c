
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "stack.h"

struct S {
    char c;
};

int main(int n_args, char *args[]){
    char c[3];
    struct S s[3];
    fus_value_t v[3];
    fus_stack_t t[3];

    printf("c: %li, %p %p %p\n", sizeof(*c), &c[0], &c[1], &c[2]);
    printf("s: %li, %p %p %p\n", sizeof(*s), &s[0], &s[1], &s[2]);
    printf("v: %li, %p %p %p\n", sizeof(*v), &v[0], &v[1], &v[2]);
    printf("t: %li, %p %p %p\n", sizeof(*t), &t[0], &t[1], &t[2]);

    printf("int: %li\n", sizeof(int));
    printf("int*: %li\n", sizeof(int*));
    printf("value*: %li\n", sizeof(fus_value_t*));

    printf("OK\n");
    return 0;
}

