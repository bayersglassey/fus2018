
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "includes.h"


void run_tests(fus_vm_t *vm){
    #define DEBUG_THING(THING, FMT) printf(#THING " = " FMT "\n", THING);
    DEBUG_THING(FUS_INT_MIN, "%li")
    DEBUG_THING(FUS_INT_MAX, "%li")
    DEBUG_THING((unsigned long)FUS_INT_MIN, "%lu")
    DEBUG_THING((unsigned long)FUS_INT_MAX, "%lu")
    DEBUG_THING((unsigned long)FUS_INT_MIN << 2, "%lu")
    DEBUG_THING((unsigned long)FUS_INT_MAX << 2, "%lu")
    DEBUG_THING((unsigned long)FUS_INT_MIN, "%lX")
    DEBUG_THING((unsigned long)FUS_INT_MAX, "%lX")
    DEBUG_THING((unsigned long)FUS_INT_MIN << 2, "%lX")
    DEBUG_THING((unsigned long)FUS_INT_MAX << 2, "%lX")
    DEBUG_THING(FUS_PAYLOAD_MIN, "%li")
    DEBUG_THING(FUS_PAYLOAD_MAX, "%li")
    DEBUG_THING((unsigned long)3, "%lu")

    DEBUG_THING((fus_uint_t)FUS_INT_MIN, "%lX")
    DEBUG_THING((fus_uint_t)FUS_INT_MIN + 1, "%lX")
    DEBUG_THING((fus_uint_t)FUS_INT_MIN >> 3, "%lX")
    DEBUG_THING(FUS_INT_MIN, "%lX")
    DEBUG_THING(FUS_INT_MIN + 1, "%lX")
    DEBUG_THING(FUS_INT_MIN >> 3, "%lX")
    DEBUG_THING(FUS_INT_MIN >> 6, "%lX")
    DEBUG_THING(FUS_INT_MIN >> 9, "%lX")
    DEBUG_THING(FUS_INT_MIN >> 12, "%lX")
    return ;
    for(fus_uint_t i = (fus_uint_t)FUS_INT_MIN >> 3; i <= (fus_uint_t)FUS_INT_MIN; i++){
        fus_uint_t j = i << 2;
        DEBUG_THING(i, "%lX")
        DEBUG_THING(j, "  %lX")
    }

    return;

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

