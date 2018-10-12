
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "includes.h"


#define FUS_PAYLOAD_TEST(X, Y) { \
    printf(#X " == " #Y "\n"); \
    n_tests++; \
    fus_unboxed_t __x = (X); \
    fus_unboxed_t __y = (Y); \
    printf("  %li == %li\n", __x, __y); \
    if(__x != __y){ \
        printf("  ...FAIL\n"); \
        n_fails++; \
    } \
}


int run_tests(fus_vm_t *vm){
    int n_tests = 0;
    int n_fails = 0;

    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm,  0)),  0)
    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm, -1)), -1)
    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm,  1)),  1)
    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm, FUS_PAYLOAD_MIN)), FUS_PAYLOAD_MIN)
    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm, FUS_PAYLOAD_MAX)), FUS_PAYLOAD_MAX)

    int x = 2;
    int y = 3;
    fus_value_t vx = fus_int(vm, x);
    fus_value_t vy = fus_int(vm, y);
    FUS_PAYLOAD_TEST(fus_int_decode(vx), x);
    FUS_PAYLOAD_TEST(fus_int_decode(vy), y);

    fus_value_t vaddxy = fus_int_add(vm, vx, vy);
    fus_value_t vsubxy = fus_int_sub(vm, vx, vy);
    fus_value_t vmulxy = fus_int_mul(vm, vx, vy);
    FUS_PAYLOAD_TEST(fus_int_decode(vaddxy), x + y)
    FUS_PAYLOAD_TEST(fus_int_decode(vsubxy), x - y)
    FUS_PAYLOAD_TEST(fus_int_decode(vmulxy), x * y)

    printf("Tests passed: %i/%i\n", n_tests - n_fails, n_tests);
    if(n_fails != 0){
        printf("*** %i TESTS NOT OK ***\n", n_fails);
        return -1;
    }else{
        printf("Tests OK!\n");
    }

    return 0;
}


int main(int n_args, char *args[]){
    int err;

    fus_core_t core;
    fus_vm_t vm;

    fus_core_init(&core);
    fus_vm_init(&vm, &core);

    if(run_tests(&vm) < 0)return EXIT_FAILURE;

    fus_vm_cleanup(&vm);
    fus_core_cleanup(&core);

    return EXIT_SUCCESS;
}

