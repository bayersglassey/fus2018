#ifndef _FUS_PARSER_H_
#define _FUS_PARSER_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


typedef struct fus_parser {
    fus_vm_t *vm;
    fus_array_t arr_stack;
    fus_arr_t arr;
} fus_parser_t;


void fus_parser_init(fus_parser_t *parser, fus_vm_t *vm);
void fus_parser_cleanup(fus_parser_t *parser);
void fus_parser_dump(fus_parser_t *parser, FILE *file);

void fus_parser_push_arr(fus_parser_t *parser);
void fus_parser_pop_arr(fus_parser_t *parser);
void fus_parser_push_value(fus_parser_t *parser, fus_value_t value);


#define FUS_PARSER_DECLS(T) \
    fus_value_t fus_value_stringparse_##T(fus_vm_t *vm, const char *token); \
    void fus_parser_stringparse_##T(fus_parser_t *parser, const char *token); \
    void fus_parser_tokenparse_##T(fus_parser_t *parser, \
        const char *token, int token_len); \
    fus_value_t fus_value_tokenparse_##T(fus_vm_t *vm, \
        const char *token, int token_len);

FUS_PARSER_DECLS(int)
FUS_PARSER_DECLS(sym)
FUS_PARSER_DECLS(str)

#endif