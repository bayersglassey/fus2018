
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

#include "../includes.h"


#define FUS_TESTS_DIVIDER_10 \
    "* * * * * "

#define FUS_TESTS_DIVIDER_80 \
    FUS_TESTS_DIVIDER_10 FUS_TESTS_DIVIDER_10 \
    FUS_TESTS_DIVIDER_10 FUS_TESTS_DIVIDER_10 \
    FUS_TESTS_DIVIDER_10 FUS_TESTS_DIVIDER_10 \
    FUS_TESTS_DIVIDER_10 FUS_TESTS_DIVIDER_10

#define FUS_TESTS_DIVIDER FUS_TESTS_DIVIDER_80

#define FUS_TESTS_BEGIN(TITLE) \
    const char *title = TITLE; \
    int n_tests = 0; \
    int n_fails = 0; \
    printf(FUS_TESTS_DIVIDER "\n"); \
    printf("BEGIN: %s\n", title);

#define FUS_TEST_SUBTITLE(SUBTITLE) \
    printf("  /* " SUBTITLE " */\n");

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
        printf("    [FAIL]\n"); \
        n_fails++; \
    } \
}

#define FUS_TEST_EQ(TOKX, TOKY, X, Y, T, FMT) \
    FUS_TEST_BINOP(TOKX, TOKY, X, Y, T, FMT, ==)
#define FUS_TEST_NE(TOKX, TOKY, X, Y, T, FMT) \
    FUS_TEST_BINOP(TOKX, TOKY, X, Y, T, FMT, !=)

#define FUS_TEST_EQ_INT(X, Y) \
    FUS_TEST_EQ(#X, #Y, X, Y, int, "%i")
#define FUS_TEST_NE_INT(X, Y) \
    FUS_TEST_NE(#X, #Y, X, Y, int, "%i")
#define FUS_TEST_EQ_PTR(X, Y) \
    FUS_TEST_EQ(#X, #Y, (void*)(X), (void*)(Y), int, "%p")
#define FUS_TEST_EQ_UNBOXED(X, Y) \
    FUS_TEST_EQ(#X, #Y, X, Y, fus_unboxed_t, "%li")
#define FUS_TEST_NE_UNBOXED(X, Y) \
    FUS_TEST_NE(#X, #Y, X, Y, fus_unboxed_t, "%li")

#define FUS_TEST_(TOKX, X) { \
    printf("  " TOKX "\n"); \
    n_tests++; \
    if(!(X)){ \
        printf("    [FAIL]\n"); \
        n_fails++; \
    } \
}
#define FUS_TEST(X) FUS_TEST_(#X, X)

#define FUS_TEST_STRCMP(X, Y) { \
    const char *__x = (X); \
    const char *__y = (Y); \
    FUS_TEST_("!strcmp(" #X ", " #Y ")", __x && __y && !strcmp(__x, __y)) \
    if(__x == NULL)printf("    NOTE: lhs is NULL\n"); \
    if(__y == NULL)printf("    NOTE: rhs is NULL\n"); \
}

#define FUS_TEST_STRNCMP(X, Y, N) { \
    const char *__x = (X); \
    const char *__y = (Y); \
    int __n = (N); \
    FUS_TEST_("!strncmp(" #X ", " #Y ", " #N ")", __x && __y && !strncmp(__x, __y, __n)) \
    if(__x == NULL)printf("    NOTE: lhs is NULL\n"); \
    if(__y == NULL)printf("    NOTE: rhs is NULL\n"); \
}


#define FUS_REFCOUNT(VALUE) ((VALUE).p->refcount)
    /* Not sure if I want this macro in the core library */



void run_unboxed_tests(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    FUS_TESTS_BEGIN("Unboxed int/null/bool tests")

    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_int(vm,  0)),  0)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_int(vm, -1)), -1)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_int(vm,  1)),  1)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_int(vm, FUS_PAYLOAD_MIN)), FUS_PAYLOAD_MIN)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_int(vm, FUS_PAYLOAD_MAX)), FUS_PAYLOAD_MAX)

    int x = 2;
    int y = 3;
    fus_value_t vx = fus_value_int(vm, x);
    fus_value_t vy = fus_value_int(vm, y);
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(vx), x)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(vy), y)

    fus_value_t vaddxy = fus_value_int_add(vm, vx, vy);
    fus_value_t vsubxy = fus_value_int_sub(vm, vx, vy);
    fus_value_t vmulxy = fus_value_int_mul(vm, vx, vy);
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(vaddxy), x + y)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(vsubxy), x - y)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(vmulxy), x * y)

    FUS_TEST_EQ_INT(vm->n_boxed, 0)

    FUS_TESTS_END()
}

void run_arr_tests_basic(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    FUS_TESTS_BEGIN("Arr tests (basic)")

    fus_value_t vx = fus_value_arr(vm);
    FUS_TEST(fus_value_is_arr(vx))
    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx), 1)

    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_arr_len(vm, vx)), 0)

    fus_value_t vx2 = vx;
    fus_value_arr_push(vm, &vx2, fus_value_int(vm, 10));
    FUS_TEST(fus_value_is_arr(vx2))
    FUS_TEST(vx2.p == vx.p)

    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_arr_len(vm, vx2)), 1)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_arr_get(vm, vx2, 0)), 10)

    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx2), 1)

    fus_value_attach(vm, vx2);
    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx2), 2)

    fus_value_t vx3 = vx2;
    fus_value_arr_push(vm, &vx3, fus_value_int(vm, 20));
    FUS_TEST(fus_value_is_arr(vx3))
    FUS_TEST(vx3.p != vx2.p)

    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx2), 1)
    FUS_TEST_EQ_INT(FUS_REFCOUNT(vx3), 1)

    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_arr_len(vm, vx2)), 1)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_arr_get(vm, vx2, 0)), 10)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_arr_len(vm, vx3)), 2)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_arr_get(vm, vx3, 0)), 10)
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_arr_get(vm, vx3, 1)), 20)

    FUS_TEST_EQ_INT(vm->n_boxed, 2)
    fus_value_detach(vm, vx2);
    FUS_TEST_EQ_INT(vm->n_boxed, 1)
    fus_value_detach(vm, vx3);
    FUS_TEST_EQ_INT(vm->n_boxed, 0)

    FUS_TESTS_END()
}

void run_arr_tests_medium(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    FUS_TESTS_BEGIN("Arr tests (intermediate)")

    fus_value_t vx = fus_value_arr(vm);
    fus_value_arr_push(vm, &vx, fus_value_int(vm, 10));
    fus_value_arr_push(vm, &vx, fus_value_int(vm, 20));

    fus_value_t vy = fus_value_arr(vm);
    fus_value_arr_push(vm, &vy, vx);

    FUS_TEST_EQ_INT(vm->n_boxed, 2)
    fus_value_detach(vm, vy);
    FUS_TEST_EQ_INT(vm->n_boxed, 0)

    FUS_TESTS_END()
}

void run_lexer_tests(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    FUS_TESTS_BEGIN("Lexer tests")

    fus_lexer_t lexer;
    fus_lexer_init(&lexer, NULL);

    #define FUS_TEST_LEXER_TEXT \
        "def test:\n" \
        "    arr \"Thing \", 2, \": \", (obj 1 =.x 2 =.y), \"!\",\n" \
        "    @format \"Thing 2: {x: 1, y: 2}!\" str_eq assert"

    #define FUS_TEST_LEXER_FULL_LEX(LEXER) \
        while(fus_lexer_is_ok(&lexer))fus_lexer_next(LEXER);

    {
        /* Here we test a full lex when chunk includes terminating NUL byte.
        (We achieve that by using strlen(chunk) + 1) */
        FUS_TEST_SUBTITLE("Full lex, NUL-terminated")

        const char *chunk = FUS_TEST_LEXER_TEXT;
        fus_lexer_t lexer;
        fus_lexer_init(&lexer, NULL);
        fus_lexer_load_chunk(&lexer, chunk, strlen(chunk) + 1);

        FUS_TEST_LEXER_FULL_LEX(&lexer)
        FUS_TEST(fus_lexer_is_done(&lexer))
        FUS_TEST(fus_lexer_got(&lexer, ""))

        fus_lexer_cleanup(&lexer);
    }

    {
        /* Here we test a full lex when chunk doesn't include terminating
        NUL byte, but we mark it as final. */
        FUS_TEST_SUBTITLE("Full lex, no NUL, marked final")

        const char *chunk = FUS_TEST_LEXER_TEXT;
        fus_lexer_t lexer;
        fus_lexer_init(&lexer, NULL);
        fus_lexer_load_chunk(&lexer, chunk, strlen(chunk));
        fus_lexer_mark_final(&lexer);

        FUS_TEST_LEXER_FULL_LEX(&lexer)
        FUS_TEST(fus_lexer_is_done(&lexer))
        FUS_TEST(fus_lexer_got(&lexer, ""))

        fus_lexer_cleanup(&lexer);
    }

    {
        /* Here we test a full lex where token is split, but chunk ends
        with whitespace (the space in FUS_TEST_LEXER_TEXT " "), so the
        "split" token is empty. */
        FUS_TEST_SUBTITLE("Full lex, split token, whitespace")

        const char *chunk = FUS_TEST_LEXER_TEXT " ";
        fus_lexer_t lexer;
        fus_lexer_init(&lexer, NULL);
        fus_lexer_load_chunk(&lexer, chunk, strlen(chunk));

        FUS_TEST_LEXER_FULL_LEX(&lexer)
        FUS_TEST(fus_lexer_is_split(&lexer))
        FUS_TEST(fus_lexer_got(&lexer, ""))

        fus_lexer_cleanup(&lexer);
    }

    {
        /* Here we test a full lex where the "assert" token is split */
        FUS_TEST_SUBTITLE("Full lex, split token, non-whitespace")

        const char *chunk = FUS_TEST_LEXER_TEXT;
        fus_lexer_t lexer;
        fus_lexer_init(&lexer, NULL);
        fus_lexer_load_chunk(&lexer, chunk, strlen(chunk));

        FUS_TEST_LEXER_FULL_LEX(&lexer)
        FUS_TEST(fus_lexer_is_split(&lexer))
        FUS_TEST(fus_lexer_got(&lexer, "assert"))

        fus_lexer_cleanup(&lexer);
    }

    {
        /* Here we explicitly test every token of a full lex */
        FUS_TEST_SUBTITLE("Full lex, token-by-token")

        const char *chunk = FUS_TEST_LEXER_TEXT;
        fus_lexer_t lexer;
        fus_lexer_init(&lexer, NULL);
        fus_lexer_load_chunk(&lexer, chunk, strlen(chunk) + 1);

        #define FUS_TEST_LEXER_GOT(TEXT, TYPE) \
            FUS_TEST(fus_lexer_got(&lexer, TEXT)) \
            FUS_TEST_EQ_INT(lexer.token_type, FUS_TOKEN_##TYPE) \
            fus_lexer_next(&lexer);

        FUS_TEST_LEXER_GOT("def", SYM);
        FUS_TEST_LEXER_GOT("test", SYM);
        FUS_TEST_LEXER_GOT("(", ARR_OPEN);
        FUS_TEST_LEXER_GOT(  "arr", SYM);
        FUS_TEST_LEXER_GOT(  "\"Thing \"", STR);
        FUS_TEST_LEXER_GOT(  ",", SYM);
        FUS_TEST_LEXER_GOT(  "2", INT);
        FUS_TEST_LEXER_GOT(  ",", SYM);
        FUS_TEST_LEXER_GOT(  "\": \"", STR);
        FUS_TEST_LEXER_GOT(  ",", SYM);
        FUS_TEST_LEXER_GOT(  "(", ARR_OPEN);
        FUS_TEST_LEXER_GOT(    "obj", SYM);
        FUS_TEST_LEXER_GOT(    "1", INT);
        FUS_TEST_LEXER_GOT(    "=.", SYM);
        FUS_TEST_LEXER_GOT(    "x", SYM);
        FUS_TEST_LEXER_GOT(    "2", INT);
        FUS_TEST_LEXER_GOT(    "=.", SYM);
        FUS_TEST_LEXER_GOT(    "y", SYM);
        FUS_TEST_LEXER_GOT(  ")", ARR_CLOSE);
        FUS_TEST_LEXER_GOT(  ",", SYM);
        FUS_TEST_LEXER_GOT(  "\"!\"", STR);
        FUS_TEST_LEXER_GOT(  ",", SYM);
        FUS_TEST_LEXER_GOT(  "@", SYM);
        FUS_TEST_LEXER_GOT(  "format", SYM);
        FUS_TEST_LEXER_GOT(  "\"Thing 2: {x: 1, y: 2}!\"", STR);
        FUS_TEST_LEXER_GOT(  "str_eq", SYM);
        FUS_TEST_LEXER_GOT(  "assert", SYM);
        FUS_TEST_LEXER_GOT(")", ARR_CLOSE);
        FUS_TEST(fus_lexer_is_done(&lexer))

        fus_lexer_cleanup(&lexer);
    }

    FUS_TESTS_END()
}

void run_symtable_tests_basic(fus_core_t *core, int *n_tests_ptr, int *n_fails_ptr){
    FUS_TESTS_BEGIN("Symtable tests (no vm)")

    fus_symtable_t table;
    fus_symtable_init(&table, core);

    FUS_TEST_EQ_INT(fus_symtable_len(&table), 0);

    int sym_i_x = fus_symtable_add_from_string(&table, "x");
    FUS_TEST_EQ_INT(fus_symtable_len(&table), 1);
    FUS_TEST_EQ_INT(fus_symtable_get_from_string(&table, "x"), sym_i_x);
    FUS_TEST_EQ_INT(fus_symtable_get_or_add_from_string(&table, "x"), sym_i_x);
    FUS_TEST_EQ_INT(fus_symtable_len(&table), 1);

    int sym_i_y = fus_symtable_add_from_string(&table, "y");
    FUS_TEST_EQ_INT(fus_symtable_len(&table), 2);
    FUS_TEST_NE_INT(sym_i_x, sym_i_y);

    FUS_TEST_EQ_INT(fus_symtable_get_from_string(&table, "x"), sym_i_x);

    int sym_i_lala = fus_symtable_add_from_string(&table, "LA LA $#@$");
    FUS_TEST_EQ_INT(fus_symtable_len(&table), 3);
    FUS_TEST_EQ_INT(fus_symtable_get_from_string(&table, "LA LA"), -1);
    FUS_TEST_EQ_INT(fus_symtable_get_from_string(&table, "LA LA $#@$ 2"), -1);
    FUS_TEST_EQ_INT(fus_symtable_get_from_string(&table, "LA LA $#@$"),
        sym_i_lala);

    fus_symtable_cleanup(&table);

    FUS_TESTS_END()
}

void run_symtable_tests_full(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    FUS_TESTS_BEGIN("Symtable tests (full)")

    fus_symtable_t *table = vm->symtable;

    int sym_i_x = fus_symtable_get_or_add_from_string(table, "x");
    FUS_TEST_EQ_UNBOXED(fus_value_sym_decode(fus_value_sym(vm, sym_i_x)), sym_i_x)

    int sym_i_y = fus_symtable_get_or_add_from_string(table, "y");
    FUS_TEST_EQ_UNBOXED(fus_value_sym_decode(fus_value_sym(vm, sym_i_y)), sym_i_y)

    FUS_TEST_NE_INT(sym_i_x, sym_i_y)
    FUS_TEST_NE_UNBOXED(
        fus_value_sym_decode(fus_value_sym(vm, sym_i_x)),
        fus_value_sym_decode(fus_value_sym(vm, sym_i_y)))

    FUS_TESTS_END()
}

void run_parser_tests_basic(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    FUS_TESTS_BEGIN("Parser tests (values)")

    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_stringparse_int(vm, "0")), 0);
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_stringparse_int(vm, "1")), 1);
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_stringparse_int(vm, "10")), 10);
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_stringparse_int(vm, "26")), 26);
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_stringparse_int(vm, "999")), 999);
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_stringparse_int(vm, "-999")), -999);
    FUS_TEST_EQ_UNBOXED(fus_value_int_decode(fus_value_stringparse_int(vm, "-0")), 0);

    FUS_TEST_EQ_UNBOXED(fus_value_sym_decode(fus_value_stringparse_sym(vm, "x")),
        fus_symtable_get_from_string(vm->symtable, "x"));
    FUS_TEST_EQ_UNBOXED(fus_value_sym_decode(fus_value_stringparse_sym(vm, "ABC123!@#")),
        fus_symtable_get_from_string(vm->symtable, "ABC123!@#"));

    fus_value_t vs1 = fus_value_stringparse_str(vm, "\"ABC\"");
    FUS_TEST_STRCMP(fus_value_str_decode(vs1), "ABC");
    fus_value_t vs2 = fus_value_stringparse_str(vm, "\"TWO\\nLINES\"");
    FUS_TEST_STRCMP(fus_value_str_decode(vs2), "TWO\nLINES");
    fus_value_t vs3 = fus_value_stringparse_str(vm, "\"\\\"QUOTED\\\"\"");
    FUS_TEST_STRCMP(fus_value_str_decode(vs3), "\"QUOTED\"");

    fus_value_detach(vm, vs1);
    fus_value_detach(vm, vs2);
    fus_value_detach(vm, vs3);

    FUS_TESTS_END()
}

void run_parser_tests_full(fus_vm_t *vm, int *n_tests_ptr, int *n_fails_ptr){
    FUS_TESTS_BEGIN("Parser tests (full)")

    fus_parser_t parser;
    fus_parser_init(&parser, vm);

    FUS_TEST_EQ_INT(parser.arr_stack.len, 0)
    FUS_TEST_EQ_INT(parser.arr.values.len, 0)
    fus_parser_stringparse_sym  (&parser, "def");
    fus_parser_stringparse_sym  (&parser, "test");
    FUS_TEST_EQ_INT(parser.arr_stack.len, 0)
    FUS_TEST_EQ_INT(parser.arr.values.len, 2)
    fus_parser_push_arr(&parser);
        FUS_TEST_EQ_INT(parser.arr_stack.len, 1)
        FUS_TEST_EQ_INT(parser.arr.values.len, 0)
        fus_parser_stringparse_sym  (&parser, "arr");
        fus_parser_stringparse_str  (&parser, "\"Thing \"");
        fus_parser_stringparse_sym  (&parser, ",");
        fus_parser_stringparse_int  (&parser, "2");
        fus_parser_stringparse_sym  (&parser, ",");
        fus_parser_stringparse_str  (&parser, "\": \"");
        fus_parser_stringparse_sym  (&parser, ",");
        fus_parser_push_arr(&parser);
            fus_parser_stringparse_sym  (&parser, "obj");
            fus_parser_stringparse_int  (&parser, "1");
            fus_parser_stringparse_sym  (&parser, "=.");
            fus_parser_stringparse_sym  (&parser, "x");
            fus_parser_stringparse_int  (&parser, "2");
            fus_parser_stringparse_sym  (&parser, "=.");
            fus_parser_stringparse_sym  (&parser, "y");
            FUS_TEST_EQ_INT(parser.arr_stack.len, 2)
            FUS_TEST_EQ_INT(parser.arr.values.len, 7)
        fus_parser_pop_arr(&parser);
        fus_parser_stringparse_sym  (&parser, ",");
        fus_parser_stringparse_str  (&parser, "\"!\"");
        fus_parser_stringparse_sym  (&parser, ",");
        fus_parser_stringparse_sym  (&parser, "@");
        fus_parser_stringparse_sym  (&parser, "format");
        fus_parser_stringparse_str  (&parser, "\"Thing 2: {x: 1, y: 2}!\"");
        fus_parser_stringparse_sym  (&parser, "str_eq");
        fus_parser_stringparse_sym  (&parser, "assert");
        FUS_TEST_EQ_INT(parser.arr_stack.len, 1)
        FUS_TEST_EQ_INT(parser.arr.values.len, 16)
    fus_parser_pop_arr(&parser);
    FUS_TEST_EQ_INT(parser.arr_stack.len, 0)
    FUS_TEST_EQ_INT(parser.arr.values.len, 3)

    fus_parser_dump(&parser, stdout);
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
    run_symtable_tests_basic(vm->core, &n_tests, &n_fails);
    run_symtable_tests_full(vm, &n_tests, &n_fails);
    run_lexer_tests(vm, &n_tests, &n_fails);
    run_parser_tests_basic(vm, &n_tests, &n_fails);
    run_parser_tests_full(vm, &n_tests, &n_fails);

    FUS_TEST_EQ_INT(vm->n_boxed, 0)

    printf("TOTALS:\n");
    FUS_TESTS_PASSED()

    return n_fails;
}

int main(int n_args, char *args[]){
    fus_t fus;
    fus_init(&fus);

    if(run_tests(&fus.vm) != 0)return EXIT_FAILURE;

    fus_cleanup(&fus);
    return EXIT_SUCCESS;
}

