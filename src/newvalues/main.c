
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "includes.h"


#define FUS_TESTS_DIVIDER_10 \
    "* * * * * "

#define FUS_TESTS_DIVIDER_80 \
    FUS_TESTS_DIVIDER_10 FUS_TESTS_DIVIDER_10 \
    FUS_TESTS_DIVIDER_10 FUS_TESTS_DIVIDER_10 \
    FUS_TESTS_DIVIDER_10 FUS_TESTS_DIVIDER_10 \
    FUS_TESTS_DIVIDER_10 FUS_TESTS_DIVIDER_10

#define FUS_TESTS_DIVIDER FUS_TESTS_DIVIDER_80

#define FUS_TESTS_BEGIN() \
    int n_tests = 0; \
    int n_fails = 0; \
    printf(FUS_TESTS_DIVIDER "\n"); \
    printf("BEGIN: %s\n", title);

#define FUS_TESTS_PASSED() \
    printf("Tests passed: %i/%i [%s]\n", n_tests - n_fails, n_tests, \
        n_fails == 0? "OK": "FAIL");

#define FUS_TESTS_END() \
    printf("END: %s\n", title); \
    FUS_TESTS_PASSED() \
    printf(FUS_TESTS_DIVIDER "\n"); \
    printf("\n"); \
    *n_tests_ptr += n_tests; \
    *n_fails_ptr += n_fails;



#define FUS_PAYLOAD_TEST(X, Y) { \
    printf("  " #X " == " #Y "\n"); \
    n_tests++; \
    fus_unboxed_t __x = (X); \
    fus_unboxed_t __y = (Y); \
    printf("    %li == %li\n", __x, __y); \
    if(__x != __y){ \
        printf("    ...FAIL\n"); \
        n_fails++; \
    } \
}

#define FUS_TEST(X) { \
    printf("  " #X " == true\n"); \
    n_tests++; \
    if(!(X)){ \
        printf("    ...FAIL\n"); \
        n_fails++; \
    } \
}



void run_unboxed_tests(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    const char *title = "Unboxed int/null/bool tests";
    FUS_TESTS_BEGIN()

    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm,  0)),  0)
    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm, -1)), -1)
    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm,  1)),  1)
    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm, FUS_PAYLOAD_MIN)), FUS_PAYLOAD_MIN)
    FUS_PAYLOAD_TEST(fus_int_decode(fus_int(vm, FUS_PAYLOAD_MAX)), FUS_PAYLOAD_MAX)

    int x = 2;
    int y = 3;
    fus_value_t vx = fus_int(vm, x);
    fus_value_t vy = fus_int(vm, y);
    FUS_PAYLOAD_TEST(fus_int_decode(vx), x)
    FUS_PAYLOAD_TEST(fus_int_decode(vy), y)

    fus_value_t vaddxy = fus_int_add(vm, vx, vy);
    fus_value_t vsubxy = fus_int_sub(vm, vx, vy);
    fus_value_t vmulxy = fus_int_mul(vm, vx, vy);
    FUS_PAYLOAD_TEST(fus_int_decode(vaddxy), x + y)
    FUS_PAYLOAD_TEST(fus_int_decode(vsubxy), x - y)
    FUS_PAYLOAD_TEST(fus_int_decode(vmulxy), x * y)

    FUS_TESTS_END()
}

void run_arr_tests(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    const char *title = "Arr tests";
    FUS_TESTS_BEGIN()

    fus_value_t vx = fus_arr(vm);
    FUS_TEST(fus_is_arr(vx))

    fus_value_t vx_len = fus_arr_len(vm, vx);
    FUS_PAYLOAD_TEST(fus_int_decode(vx_len), 0)

    FUS_TESTS_END()
}

int run_tests(fus_vm_t *vm){
    /* Returns number of failures */
    int n_tests = 0;
    int n_fails = 0;

    run_unboxed_tests(vm, &n_tests, &n_fails);
    run_arr_tests(vm, &n_tests, &n_fails);

    printf("TOTALS:\n");
    FUS_TESTS_PASSED()

    return n_fails;
}

int main(int n_args, char *args[]){
    int err;

    fus_core_t core;
    fus_vm_t vm;

    fus_core_init(&core);
    fus_vm_init(&vm, &core);

    if(run_tests(&vm) != 0)return EXIT_FAILURE;

    fus_vm_cleanup(&vm);
    fus_core_cleanup(&core);

    return EXIT_SUCCESS;
}

