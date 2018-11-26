#ifndef _FUS_KEYWORD_H_
#define _FUS_KEYWORD_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


typedef int fus_keyword_parse_args_t(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr,
    fus_value_t *args_inline);

struct fus_keyword {
    fus_vm_t *vm;

    const char *name;
    const char *token;
    const char *s_args_in;
    const char *s_args_out;
    const char *s_args_inline;

    fus_keyword_parse_args_t *parse_args;
};

void fus_keyword_init(fus_keyword_t *keyword, fus_vm_t *vm,
    const char *name, const char *token,
    const char *s_args_in, const char *s_args_out,
    const char *s_args_inline,
    fus_keyword_parse_args_t *parse_args);
void fus_keyword_cleanup(fus_keyword_t *keyword);


fus_keyword_parse_args_t fus_keyword_parse_args;
fus_keyword_parse_args_t fus_keyword_parse_args_tuple;
fus_keyword_parse_args_t fus_keyword_parse_args_def;
fus_keyword_parse_args_t fus_keyword_parse_args_call;
fus_keyword_parse_args_t fus_keyword_parse_args_if;
fus_keyword_parse_args_t fus_keyword_parse_args_do;


#endif