
#include "includes.h"


void fus_keyword_init(fus_keyword_t *keyword, fus_vm_t *vm,
    const char *name, const char *token,
    const char *s_args_in, const char *s_args_out,
    const char *s_args_inline,
    fus_keyword_parse_args_t *parse_args
){
    keyword->vm = vm;

    token = token? token: name;
    keyword->name = name;
    keyword->token = token;
    keyword->s_args_in = s_args_in;
    keyword->s_args_out = s_args_out;
    keyword->s_args_inline = s_args_inline;

    keyword->sym_i = fus_symtable_get_or_add_from_string(
        vm->symtable, token);

    keyword->parse_args = parse_args;
}

void fus_keyword_cleanup(fus_keyword_t *keyword){
    /* Nuthin to do */
}


int fus_keyword_parse_args(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr,
    fus_value_t *args_inline
){
    *n_args_in_ptr = strlen(keyword->s_args_in);
    *n_args_out_ptr = strlen(keyword->s_args_out);
    int n_args_inline = strlen(keyword->s_args_inline);
    *n_args_inline_ptr = n_args_inline;

    int data_len = fus_arr_len(keyword->vm, data);
    if(i0 >= data_len + n_args_inline){
        fprintf(stderr, "%s: %s: Not enough tokens "
            "(need %i, only %i remaining)\n",
            __func__, keyword->name, n_args_inline,
            data_len - i0);
        return -1;
    }
    return 0;
}

int fus_keyword_parse_args_tuple(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr,
    fus_value_t *args_inline
){
    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr, args_inline))return -1;

    /* We expect 1 inline arg: a fus_value_int. E.g. in "tuple 4" the 4 is
    args_inline[0], and becomes our n_args_in. */
    int n_args_in = fus_value_int_decode(keyword->vm, args_inline[0]);
    *n_args_in_ptr = n_args_in;
    return 0;
}

int fus_keyword_parse_args_def(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr,
    fus_value_t *args_inline
){
    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr, args_inline))return -1;
    /* TODO: implement me!.. */
    return 0;
}

int fus_keyword_parse_args_call(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr,
    fus_value_t *args_inline
){
    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr, args_inline))return -1;
    /* TODO: implement me!.. */
    return 0;
}

int fus_keyword_parse_args_if(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr,
    fus_value_t *args_inline
){
    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr, args_inline))return -1;
    /* TODO: implement me!.. */
    return 0;
}

int fus_keyword_parse_args_do(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr,
    fus_value_t *args_inline
){
    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr, args_inline))return -1;
    /* TODO: implement me!.. */
    return 0;
}


/* fus_keyword_check_args_in - verifies types of stuff on stack */
/* fus_keyword_check_args_out - verifies types of stuff on stack */
