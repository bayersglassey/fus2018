
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "includes.h"


void run_tests(fus_vm_t *vm){
    fus_value_t x = fus_int(vm, 2);
    fus_value_t y = fus_int(vm, 3);
    fus_value_t xay = fus_int_add(vm, x, y);
    fus_value_t xsy = fus_int_sub(vm, x, y);
    fus_value_t xmy = fus_int_mul(vm, x, y);
    printf("%li + %li = %li\n",
        fus_int_decode(x),
        fus_int_decode(y),
        fus_int_decode(xay));
    printf("%li - %li = %li\n",
        fus_int_decode(x),
        fus_int_decode(y),
        fus_int_decode(xsy));
    printf("%li * %li = %li\n",
        fus_int_decode(x),
        fus_int_decode(y),
        fus_int_decode(xmy));
}


int main(int n_args, char *args[]){
    int err;

    fus_core_t core;
    fus_vm_t vm;

    fus_core_init(&core);
    fus_vm_init(&vm, &core);

    run_tests(&vm);

    fus_vm_cleanup(&vm);
    fus_core_cleanup(&core);

    printf("OK\n");
    return 0;
}

