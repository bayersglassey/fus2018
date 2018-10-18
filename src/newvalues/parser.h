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
void fus_parser_fprint(fus_parser_t *parser, FILE *file);
void fus_parser_print(fus_parser_t *parser);

void fus_parser_push_arr(fus_parser_t *parser);
void fus_parser_pop_arr(fus_parser_t *parser);

void fus_parser_stringparse_name(fus_parser_t *parser, const char *string);
void fus_parser_stringparse_op(fus_parser_t *parser, const char *string);
void fus_parser_stringparse_int(fus_parser_t *parser, const char *string);
void fus_parser_stringparse_str(fus_parser_t *parser, const char *string);

void fus_parser_tokenparse_name(fus_parser_t *parser,
    const char *token, int token_len);
void fus_parser_tokenparse_op(fus_parser_t *parser,
    const char *token, int token_len);
void fus_parser_tokenparse_int(fus_parser_t *parser,
    const char *token, int token_len);
void fus_parser_tokenparse_str(fus_parser_t *parser,
    const char *token, int token_len);

#endif