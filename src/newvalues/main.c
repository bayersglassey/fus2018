
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



#define FUS_TEST_BINOP(TOKX, TOKY, X, Y, T, FMT, OP) { \
    printf("  " TOKX " " #OP " " TOKY "\n"); \
    n_tests++; \
    T __x = (X); \
    T __y = (Y); \
    printf("    " FMT " " #OP " " FMT "\n", __x, __y); \
    if(!(__x OP __y)){ \
        printf("    ...FAIL\n"); \
        n_fails++; \
    } \
}

#define FUS_TEST_EQ(TOKX, TOKY, X, Y, T, FMT) \
    FUS_TEST_BINOP(TOKX, TOKY, X, Y, T, FMT, ==)
#define FUS_TEST_NE(TOKX, TOKY, X, Y, T, FMT) \
    FUS_TEST_BINOP(TOKX, TOKY, X, Y, T, FMT, !=)

#define FUS_TEST_EQ_INT(X, Y) \
    FUS_TEST_EQ(#X, #Y, X, Y, int, "%i")
#define FUS_TEST_EQ_PTR(X, Y) \
    FUS_TEST_EQ(#X, #Y, (void*)(X), (void*)(Y), int, "%p")
#define FUS_TEST_EQ_UNBOXED(X, Y) \
    FUS_TEST_EQ(#X, #Y, X, Y, fus_unboxed_t, "%li")

#define FUS_TEST(X) { \
    printf("  " #X "\n"); \
    n_tests++; \
    if(!(X)){ \
        printf("    ...FAIL\n"); \
        n_fails++; \
    } \
}


#define FUS_REFCOUNT(VALUE) ((VALUE).p->refcount)
    /* Not sure if I want this macro in the core library */



void run_unboxed_tests(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    const char *title = "Unboxed int/null/bool tests";
    FUS_TESTS_BEGIN()

    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_int(vm,  0)),  0)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_int(vm, -1)), -1)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_int(vm,  1)),  1)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_int(vm, FUS_PAYLOAD_MIN)), FUS_PAYLOAD_MIN)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_int(vm, FUS_PAYLOAD_MAX)), FUS_PAYLOAD_MAX)

    int x = 2;
    int y = 3;
    fus_value_t vx = fus_int(vm, x);
    fus_value_t vy = fus_int(vm, y);
    FUS_TEST_EQ_UNBOXED(fus_int_decode(vx), x)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(vy), y)

    fus_value_t vaddxy = fus_int_add(vm, vx, vy);
    fus_value_t vsubxy = fus_int_sub(vm, vx, vy);
    fus_value_t vmulxy = fus_int_mul(vm, vx, vy);
    FUS_TEST_EQ_UNBOXED(fus_int_decode(vaddxy), x + y)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(vsubxy), x - y)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(vmulxy), x * y)

    FUS_TEST_EQ_INT(vm->n_boxed, 0)

    FUS_TESTS_END()
}

void run_arr_tests_basic(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    const char *title = "Arr tests (basic)";
    FUS_TESTS_BEGIN()

    fus_value_t vx = fus_arr(vm);
    FUS_TEST(fus_is_arr(vx))
    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx), 1)

    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_arr_len(vm, vx)), 0)

    fus_value_t vx2 = vx;
    fus_arr_push(vm, &vx2, fus_int(vm, 10));
    FUS_TEST(fus_is_arr(vx2))
    FUS_TEST(vx2.p == vx.p)

    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_arr_len(vm, vx2)), 1)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_arr_get(vm, vx2, 0)), 10)

    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx2), 1)

    fus_value_attach(vx2);
    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx2), 2)

    fus_value_t vx3 = vx2;
    fus_arr_push(vm, &vx3, fus_int(vm, 20));
    FUS_TEST(fus_is_arr(vx3))
    FUS_TEST(vx3.p != vx2.p)

    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx2), 1)
    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx3), 1)

    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_arr_len(vm, vx2)), 1)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_arr_get(vm, vx2, 0)), 10)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_arr_len(vm, vx3)), 2)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_arr_get(vm, vx3, 0)), 10)
    FUS_TEST_EQ_UNBOXED(fus_int_decode(fus_arr_get(vm, vx3, 1)), 20)

    FUS_TEST_EQ_INT(vm->n_boxed, 2)
    fus_value_detach(vx2);
    FUS_TEST_EQ_INT(vm->n_boxed, 1)
    fus_value_detach(vx3);
    FUS_TEST_EQ_INT(vm->n_boxed, 0)

    FUS_TESTS_END()
}

void run_arr_tests_medium(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    const char *title = "Arr tests (intermediate)";
    FUS_TESTS_BEGIN()

    fus_value_t vx = fus_arr(vm);
    fus_arr_push(vm, &vx, fus_int(vm, 10));
    fus_arr_push(vm, &vx, fus_int(vm, 20));

    fus_value_t vy = fus_arr(vm);
    fus_arr_push(vm, &vy, vx);

    FUS_TEST_EQ_INT(vm->n_boxed, 2)
    fus_value_detach(vy);
    FUS_TEST_EQ_INT(vm->n_boxed, 0)

    FUS_TESTS_END()
}

void run_lexer_tests(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    const char *title = "Lexer tests";
    FUS_TESTS_BEGIN()

    fus_lexer_t lexer;
    fus_lexer_init(&lexer);

    const char *text =
        "def test:\n"
        "    arr \"Thing \", 2, \": \", (obj 1 =.x 2 =.y), \"!\",\n"
        "    @format \"Thing 2: {x: 1, y: 2}!\" str_eq assert";

    fus_lexer_load_chunk(&lexer, text, strlen(text));

    #define FUS_TEST_LEXER_GOT(TEXT) \
        fus_lexer_next(&lexer); \
        FUS_TEST(fus_lexer_got(&lexer, TEXT))

    FUS_TEST_LEXER_GOT("def");
    FUS_TEST_LEXER_GOT("test");
    FUS_TEST_LEXER_GOT("(");
    FUS_TEST_LEXER_GOT(  "arr");
    FUS_TEST_LEXER_GOT(  "\"Thing \"");
    FUS_TEST_LEXER_GOT(  ",");
    FUS_TEST_LEXER_GOT(  "2");
    FUS_TEST_LEXER_GOT(  ",");
    FUS_TEST_LEXER_GOT(  "\": \"");
    FUS_TEST_LEXER_GOT(  ",");
    FUS_TEST_LEXER_GOT(  "(");
    FUS_TEST_LEXER_GOT(    "obj");
    FUS_TEST_LEXER_GOT(    "1");
    FUS_TEST_LEXER_GOT(    "=.");
    FUS_TEST_LEXER_GOT(    "x");
    FUS_TEST_LEXER_GOT(    "2");
    FUS_TEST_LEXER_GOT(    "=.");
    FUS_TEST_LEXER_GOT(    "y");
    FUS_TEST_LEXER_GOT(  ")");
    FUS_TEST_LEXER_GOT(  ",");
    FUS_TEST_LEXER_GOT(  "\"!\"");
    FUS_TEST_LEXER_GOT(  ",");
    FUS_TEST_LEXER_GOT(  "@");
    FUS_TEST_LEXER_GOT(  "format");
    FUS_TEST_LEXER_GOT(  "\"Thing 2: {x: 1, y: 2}!\"");
    FUS_TEST_LEXER_GOT(  "str_eq");
    FUS_TEST_LEXER_GOT(  "assert");
    FUS_TEST_LEXER_GOT(")");

    FUS_TEST(fus_lexer_done(&lexer))

    fus_lexer_cleanup(&lexer);

    FUS_TESTS_END()
}

void run_parser_tests(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    const char *title = "Parser tests";
    FUS_TESTS_BEGIN()

    fus_parser_t parser;
    fus_parser_init(&parser, vm);

    FUS_TEST_EQ_INT(parser.arr_stack.len, 0)
    FUS_TEST_EQ_INT(parser.arr.values.len, 0)
    fus_parser_stringparse_name (&parser, "def");
    fus_parser_stringparse_name (&parser, "test");
    FUS_TEST_EQ_INT(parser.arr_stack.len, 0)
    FUS_TEST_EQ_INT(parser.arr.values.len, 2)
    fus_parser_push_arr(&parser);
        FUS_TEST_EQ_INT(parser.arr_stack.len, 1)
        FUS_TEST_EQ_INT(parser.arr.values.len, 0)
        fus_parser_stringparse_name (&parser, "arr");
        fus_parser_stringparse_str  (&parser, "\"Thing \"");
        fus_parser_stringparse_op   (&parser, ",");
        fus_parser_stringparse_int  (&parser, "2");
        fus_parser_stringparse_op   (&parser, ",");
        fus_parser_stringparse_str  (&parser, "\": \"");
        fus_parser_stringparse_op   (&parser, ",");
        fus_parser_push_arr(&parser);
            fus_parser_stringparse_name (&parser, "obj");
            fus_parser_stringparse_int  (&parser, "1");
            fus_parser_stringparse_op   (&parser, "=.");
            fus_parser_stringparse_name (&parser, "x");
            fus_parser_stringparse_int  (&parser, "2");
            fus_parser_stringparse_op   (&parser, "=.");
            fus_parser_stringparse_name (&parser, "y");
            FUS_TEST_EQ_INT(parser.arr_stack.len, 2)
            FUS_TEST_EQ_INT(parser.arr.values.len, 7)
        fus_parser_pop_arr(&parser);
        fus_parser_stringparse_op   (&parser, ",");
        fus_parser_stringparse_str  (&parser, "\"!\"");
        fus_parser_stringparse_op   (&parser, ",");
        fus_parser_stringparse_op   (&parser, "@");
        fus_parser_stringparse_name (&parser, "format");
        fus_parser_stringparse_str  (&parser, "\"Thing 2: {x: 1, y: 2}!\"");
        fus_parser_stringparse_name (&parser, "str_eq");
        fus_parser_stringparse_name (&parser, "assert");
        FUS_TEST_EQ_INT(parser.arr_stack.len, 1)
        FUS_TEST_EQ_INT(parser.arr.values.len, 16)
    fus_parser_pop_arr(&parser);
    FUS_TEST_EQ_INT(parser.arr_stack.len, 0)
    FUS_TEST_EQ_INT(parser.arr.values.len, 3)

    fus_parser_print(&parser); printf("\n");

    fus_parser_cleanup(&parser);

    FUS_TESTS_END()
}

int run_tests(fus_vm_t *vm){
    /* Returns number of failures */
    int n_tests = 0;
    int n_fails = 0;

    run_unboxed_tests(vm, &n_tests, &n_fails);
    run_arr_tests_basic(vm, &n_tests, &n_fails);
    run_arr_tests_medium(vm, &n_tests, &n_fails);
    //run_lexer_tests(vm, &n_tests, &n_fails);
    run_parser_tests(vm, &n_tests, &n_fails);

    FUS_TEST_EQ_INT(vm->n_boxed, 0)

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

