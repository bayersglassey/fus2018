
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


static int argslen(const char *args_text){
    /* Parses the strings representing keywords' args and their types.
    Returns the number of args represented by the string, or 0 if a special
    parse_args is expected (e.g. fus_keyword_parse_args_tuple).
    E.g. "ii" -> 2, "*" -> 1, "?" -> 0 */
    if(args_text[0] == '?')return 0;
    return strlen(args_text);
}

static bool check_n_args(fus_keyword_t *keyword, fus_arr_t *data,
    int i0, int n_args_inline
){
    int data_len = fus_arr_len(keyword->vm, data);
    if(i0 > data_len + n_args_inline){
        fprintf(stderr, "%s: %s: Not enough tokens "
            "(need %i, only %i remaining)\n",
            __func__, keyword->name, n_args_inline,
            data_len - i0);
        return false;
    }
    return true;
}

static bool check_arg(char c, fus_value_t value){
    switch(c){
        case '*': return true;
        case 'i': return fus_value_is_int(value);
        case 'y': return fus_value_is_sym(value);
        case 'n': return fus_value_is_null(value);
        case 'b': return fus_value_is_bool(value);
        case 'a': case 'c': return fus_value_is_arr(value);
        case 's': return fus_value_is_str(value);
        case 'o': return fus_value_is_obj(value);
        case 'f': return fus_value_is_fun(value);
        default:
            fprintf(stderr, "%s: Unrecognized type char: %c\n",
                __func__, c);
            break;
    }
    return false;
}

int fus_keyword_parse_args(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr
){
    *n_args_in_ptr = argslen(keyword->s_args_in);
    *n_args_out_ptr = argslen(keyword->s_args_out);

    const char *s_args_inline = keyword->s_args_inline;
    int n_args_inline = argslen(s_args_inline);
    *n_args_inline_ptr = n_args_inline;

    if(!check_n_args(keyword, data, i0, n_args_inline))return -1;

    fus_value_t *values = FUS_ARR_VALUES(*data);
    for(int i = 0; i < n_args_inline; i++){
        char c = s_args_inline[i];
        fus_value_t value = values[i0 + i];
        bool check = check_arg(c, value);
        if(!check){
            fprintf(stderr, "%s: Typecheck failed! "
                "s_args_inline=\"%s\" i=%i c='%c' value: ",
                __func__, s_args_inline, i, c);
            fus_value_fprint(keyword->vm, value, stderr);
            fprintf(stderr, "\n");
            return -1;
        }
    }

    return 0;
}

int fus_keyword_parse_args_tuple(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr
){
    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr))return -1;

    /* We expect 1 inline arg: a fus_value_int. E.g. in "tuple 4" the 4
    becomes our n_args_in. */
    fus_value_t *values = FUS_ARR_VALUES(*data);
    int n_args_in = fus_value_int_decode(keyword->vm, values[i0]);
    *n_args_in_ptr = n_args_in;
    return 0;
}

int fus_keyword_parse_args_call(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr
){
    /* Used by: fun_quote, call_inline, call */

    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr))return -1;

    /* TODO: Figure out args_in, args_out based on sig */
    return 0;
}

int fus_keyword_parse_args_if(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr
){
    /* Used by: if, ifelse, and, or */

    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr))return -1;

    /* TODO: Figure out args_in, args_out based on branches */
    return 0;
}

int fus_keyword_parse_args_do(fus_keyword_t *keyword,
    fus_arr_t *data, int i0,
    int *n_args_in_ptr,
    int *n_args_out_ptr,
    int *n_args_inline_ptr
){
    /* Used by: do, int_for, arr_for */

    if(fus_keyword_parse_args(keyword, data, i0, n_args_in_ptr,
        n_args_out_ptr, n_args_inline_ptr))return -1;

    /* TODO: Figure out args_in, args_out based on body */
    return 0;
}


/* fus_keyword_check_args_in - verifies types of stuff on stack */
/* fus_keyword_check_args_out - verifies types of stuff on stack */
