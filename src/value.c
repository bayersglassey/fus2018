
#include "includes.h"


int fus_type_get_sym_i(fus_type_t type){
    if(type == FUS_TYPE_NULL){
        return FUS_SYMCODE_NULL;
    }else if(type == FUS_TYPE_BOOL){
        return FUS_SYMCODE_BOOL;
    }else if(type == FUS_TYPE_INT || type == FUS_TYPE_BIGINT){
        return FUS_SYMCODE_INT;
    }else if(type == FUS_TYPE_STR){
        return FUS_SYMCODE_STR;
    }else if(type == FUS_TYPE_SYM){
        return FUS_SYMCODE_SYM;
    }else if(type == FUS_TYPE_ARR){
        return FUS_SYMCODE_ARR;
    }else if(type == FUS_TYPE_OBJ){
        return FUS_SYMCODE_OBJ;
    }else if(type == FUS_TYPE_FUN){
        return FUS_SYMCODE_FUN;
    }else{
        ERR_INFO();
        fprintf(stderr, "Unrecognized type: %i\n", type);
        return -1;
    }
}

char fus_type_to_c(fus_type_t type){
    switch(type){
    case FUS_TYPE_ANY: return '*';
    case FUS_TYPE_NULL: return 'n';
    case FUS_TYPE_BOOL: return 'b';
    case FUS_TYPE_INT: return 'i';
    case FUS_TYPE_BIGINT: return 'i';
    case FUS_TYPE_STR: return 's';
    case FUS_TYPE_SYM: return 'y';
    case FUS_TYPE_OBJ: return 'o';
    case FUS_TYPE_ARR: return 'a';
    case FUS_TYPE_FUN: return 'f';
    default:
        ERR_INFO();
        fprintf(stderr, "Unrecognized type: %i\n", type);
        return '?';
    }
}

fus_type_t fus_type_from_c(char c){
    switch(c){
    case '*': return FUS_TYPE_ANY;
    case 'n': return FUS_TYPE_NULL;
    case 'b': return FUS_TYPE_BOOL;
    case 'i': return FUS_TYPE_INT;
    case 's': return FUS_TYPE_STR;
    case 'y': return FUS_TYPE_SYM;
    case 'o': return FUS_TYPE_OBJ;
    case 'a': return FUS_TYPE_ARR;
    case 'f': return FUS_TYPE_FUN;
    default:
        ERR_INFO();
        fprintf(stderr, "Unrecognized typechar: %c (%i)\n", c, (int)c);
        return FUS_TYPE_NULL; /* ??? */
    }
}


void fus_value_attach(fus_value_t value){
    if(value.type == FUS_TYPE_BIGINT){
        FUS_ATTACH(bigint, value.data.bi)
    }else if(value.type == FUS_TYPE_STR){
        FUS_ATTACH(str, value.data.s)
    }else if(value.type == FUS_TYPE_ARR){
        FUS_ATTACH(arr, value.data.a)
    }else if(value.type == FUS_TYPE_OBJ){
        FUS_ATTACH(obj, value.data.o)
    }
}

void fus_value_detach(fus_value_t value){
    if(value.type == FUS_TYPE_BIGINT){
        FUS_DETACH(bigint, value.data.bi)
    }else if(value.type == FUS_TYPE_STR){
        FUS_DETACH(str, value.data.s)
    }else if(value.type == FUS_TYPE_ARR){
        FUS_DETACH(arr, value.data.a)
    }else if(value.type == FUS_TYPE_OBJ){
        FUS_DETACH(obj, value.data.o)
    }
}

void fus_value_cleanup(fus_value_t value){
    if(value.type == FUS_TYPE_BIGINT){
        fus_bigint_cleanup(value.data.bi);
    }else if(value.type == FUS_TYPE_STR){
        fus_str_cleanup(value.data.s);
    }else if(value.type == FUS_TYPE_ARR){
        fus_arr_cleanup(value.data.a);
    }else if(value.type == FUS_TYPE_OBJ){
        fus_obj_cleanup(value.data.o);
    }
}



fus_value_t fus_value_null(){
    fus_value_t value;
    value.type = FUS_TYPE_NULL;
    value.data.i = 0;
    return value;
}

fus_value_t fus_value_bool(bool b){
    fus_value_t value;
    value.type = FUS_TYPE_BOOL;
    value.data.b = b;
    return value;
}

fus_value_t fus_value_int(int i){
    fus_value_t value;
    value.type = FUS_TYPE_INT;
    value.data.i = i;
    return value;
}

fus_str_t *fus_str(char *ss){
    if(ss == NULL)return NULL;
    fus_str_t *s = malloc(sizeof(*s));
    if(s == NULL)return NULL;
    s->refcount = 0;
    s->text = ss;
    int text_len = strlen(ss);
    s->text_len = text_len; /* or text_len + 1 ?.. */
    s->text_size = text_len + 1;
    return s;
}

fus_value_t fus_value_str(fus_str_t *s){
    fus_value_t value;
    value.type = FUS_TYPE_STR;
    value.data.s = s;
    return value;
}

fus_value_t fus_value_sym(int sym_i){
    fus_value_t value;
    value.type = FUS_TYPE_SYM;
    value.data.i = sym_i;
    return value;
}

fus_value_t fus_value_arr(fus_arr_t *a){
    fus_value_t value;
    value.type = FUS_TYPE_ARR;
    value.data.a = a;
    return value;
}

fus_value_t fus_value_obj(fus_obj_t *o){
    fus_value_t value;
    value.type = FUS_TYPE_OBJ;
    value.data.o = o;
    return value;
}

fus_value_t fus_value_fun(fus_code_t *code){
    fus_value_t value;
    value.type = FUS_TYPE_FUN;
    value.data.f = code;
    return value;
}






void fus_bigint_cleanup(fus_bigint_t *bi){
    if(bi == NULL)return;
    ARRAY_FREE(int, bi->digits, (void))
}

void fus_str_cleanup(fus_str_t *s){
    if(s == NULL)return;
    ARRAY_FREE(char, s->text, (void))
}

void fus_arr_cleanup(fus_arr_t *a){
    if(a == NULL)return;
    ARRAY_FREE_BYVAL(fus_value_t, a->values, fus_value_detach)
}

int fus_arr_init(fus_arr_t *a){
    a->refcount = 0;
    ARRAY_INIT(a->values)
    return 0;
}

int fus_arr_copy(fus_arr_t *a, fus_arr_t *a0){
    int err;
    err = fus_arr_init(a);
    if(err)return err;
    ARRAY_COPY(fus_value_t, a0->values, a->values)
    for(int i = 0; i < a->values_len; i++){
        fus_value_attach(a->values[i]);
    }
    return 0;
}

int fus_arr_copy_stack(fus_arr_t *a, fus_stack_t *stack){
    int err;
    err = fus_arr_init(a);
    if(err)return err;
    int len = fus_stack_len(stack);
    if(len >= 1){
        err = fus_arr_push_l(a, stack->tos);
        if(err)return err;
        if(len >= 2){
            err = fus_arr_push_l(a, stack->nos);
            if(err)return err;
            for(int i = stack->tail_len - 1; i >= 0; i--){
                err = fus_arr_push_l(a, stack->tail[i]);
                if(err)return err;
            }
        }
    }
    return 0;
}

int fus_arr_push(fus_arr_t *a, fus_value_t value){
    int err;
    if(a == NULL){
        ERR_INFO();
        fprintf(stderr, "Can't push onto NULL arr\n");
        return 2;
    }
    ARRAY_PUSH(fus_value_t, a->values, value)
    fus_value_attach(value);
    return 0;
}

int fus_arr_push_l(fus_arr_t *a, fus_value_t value){
    int err;
    if(a == NULL){
        ERR_INFO();
        fprintf(stderr, "Can't push onto NULL arr\n");
        return 2;
    }
    int old_values_len = a->values_len;
    ARRAY_PUSH(fus_value_t, a->values, (fus_value_t){0})
    for(int i = old_values_len - 1; i >= 0; i--){
        a->values[i + 1] = a->values[i];
    }
    a->values[0] = value;
    fus_value_attach(value);
    return 0;
}

int fus_arr_get(fus_arr_t *a, int i, fus_value_t *value_ptr){
    int err;
    if(a == NULL){
        ERR_INFO();
        fprintf(stderr, "Can't get from NULL arr\n");
        return 2;
    }else if(i < 0 || i >= a->values_len){
        ERR_INFO();
        fprintf(stderr, "Can't get index %i from arr with length %i\n",
            i, a->values_len);
        return 2;
    }
    *value_ptr = a->values[i];
    return 0;
}

int fus_arr_rip(fus_arr_t *a, int i, fus_value_t *value_ptr){
    int err;
    err = fus_arr_get(a, i, value_ptr);
    if(err)return err;
    a->values[i] = fus_value_null();
    return 0;
}

int fus_arr_set(fus_arr_t *a, int i, fus_value_t value){
    int err;
    if(a == NULL){
        ERR_INFO();
        fprintf(stderr, "Can't set on NULL arr\n");
        return 2;
    }else if(i < 0 || i >= a->values_len){
        ERR_INFO();
        fprintf(stderr, "Can't set index %i on arr with length %i\n",
            i, a->values_len);
        return 2;
    }
    fus_value_detach(a->values[i]);
    a->values[i] = value;
    fus_value_attach(value);
    return 0;
}

int fus_arr_pop(fus_arr_t *a, fus_value_t *value_ptr){
    int err;
    if(a == NULL){
        ERR_INFO();
        fprintf(stderr, "Can't pop from NULL arr\n");
        return 2;
    }else if(a->values_len <= 0){
        ERR_INFO();
        fprintf(stderr, "Can't pop from empty arr\n");
        return 2;
    }
    ARRAY_POP(fus_value_t, a->values, *value_ptr)
    return 0;
}

int fus_arr_pop_l(fus_arr_t *a, fus_value_t *value_ptr){
    int err;
    if(a == NULL){
        ERR_INFO();
        fprintf(stderr, "Can't pop from NULL arr\n");
        return 2;
    }else if(a->values_len <= 0){
        ERR_INFO();
        fprintf(stderr, "Can't pop from empty arr\n");
        return 2;
    }
    *value_ptr = a->values[0];
    for(int i = 1; i < a->values_len; i++){
        a->values[i - 1] = a->values[i];
    }
    fus_value_t popped_value;
    ARRAY_POP(fus_value_t, a->values, popped_value)
    return 0;
}

int fus_arr_len(fus_arr_t *a){
    if(a == NULL)return 0;
    return a->values_len;
}

void fus_obj_entry_cleanup(fus_obj_entry_t *entry){
    if(entry == NULL)return;
    fus_value_detach(entry->value);
}

int fus_obj_entry_init(fus_obj_entry_t *entry, int sym_i,
    fus_value_t value
){
    entry->sym_i = sym_i;
    entry->value = value;
    fus_value_attach(value);
    return 0;
}

void fus_obj_cleanup(fus_obj_t *o){
    if(o == NULL)return;
    ARRAY_FREE(fus_obj_entry_t, o->entries, fus_obj_entry_cleanup)
}

int fus_obj_init(fus_obj_t *o){
    o->refcount = 0;
    ARRAY_INIT(o->entries)
    return 0;
}

int fus_obj_copy(fus_obj_t *o, fus_obj_t *o0){
    int err;
    err = fus_obj_init(o);
    if(err)return err;
    ARRAY_COPY(fus_obj_entry_t, o0->entries, o->entries)
    for(int i = 0; i < o->entries_len; i++){
        fus_value_attach(o->entries[i].value);
    }
    return 0;
}

fus_obj_entry_t *fus_obj_get(fus_obj_t *o, int sym_i){
    if(o != NULL){
        for(int i = 0; i < o->entries_len; i++){
            fus_obj_entry_t *entry = &o->entries[i];
            if(entry->sym_i == sym_i)return entry;
        }
    }
    return NULL;
}

int fus_obj_set(fus_obj_t *o, int sym_i, fus_value_t value){
    /* The obj is expected to be "unique" (that is, non-NULL and
    with refcount == 1) */
    for(int i = 0; i < o->entries_len; i++){
        fus_obj_entry_t *entry = &o->entries[i];
        if(entry->sym_i == sym_i){
            entry->value = value;
            return 0;
        }
    }
    ARRAY_PUSH(fus_obj_entry_t, o->entries, (fus_obj_entry_t){0})
    fus_obj_entry_t *entry = &o->entries[o->entries_len - 1];
    entry->sym_i = sym_i;
    entry->value = value;
    return 0;
}

int fus_obj_keys(fus_obj_t *o, fus_arr_t **a_ptr){
    int err;
    fus_arr_t *a = NULL;
    if(o != NULL && o->entries_len > 0){
        a = malloc(sizeof(*a));
        if(a == NULL)return 1;
        err = fus_arr_init(a);
        if(err)return err;
        for(int i = 0; i < o->entries_len; i++){
            fus_obj_entry_t *entry = &o->entries[i];
            err = fus_arr_push(a, fus_value_sym(entry->sym_i));
            if(err)return err;
        }
    }
    *a_ptr = a;
    return 0;
}



void fus_bigint_print(fus_bigint_t *bi, fus_symtable_t *symtable, FILE *f,
    int indent, int depth
){
    fprintf(f, "\"No representation for bigints yet\" error");
}

void fus_str_print(fus_str_t *s, fus_symtable_t *symtable, FILE *f,
    int indent, int depth
){
    fus_write_str(f, s == NULL? NULL: s->text);
}

void fus_arr_print(fus_arr_t *a, fus_symtable_t *symtable, FILE *f,
    int indent, int depth
){
    fprintf(f, "(arr");
    if(a != NULL){
        for(int i = 0; i < a->values_len; i++){
            fprintf(f, " ");
            fus_value_print(a->values[i], symtable, f,
                indent, depth + 1);
            fprintf(f, ",");
        }
    }
    fprintf(f, ")");
}

void fus_obj_print(fus_obj_t *o, fus_symtable_t *symtable, FILE *f,
    int indent, int depth
){
    fprintf(f, "(obj");
    if(o != NULL){
        for(int i = 0; i < o->entries_len; i++){
            fus_obj_entry_t *entry = &o->entries[i];
            fprintf(f, " ");
            fus_value_print(entry->value, symtable, f,
                indent, depth + 1);
            if(symtable == NULL){
                fprintf(f, " =.%i", entry->sym_i);
            }else{
                const char *sym_token = fus_symtable_get_token(
                    symtable, entry->sym_i);
                fprintf(f, " =.%s", sym_token == NULL?
                    "SYM_NOT_FOUND": sym_token);
            }
        }
    }
    fprintf(f, ")");
}

void fus_fun_print(fus_code_t *code, fus_symtable_t *symtable, FILE *f,
    int indent, int depth
){
    /* Ummmm. */
    fprintf(f, "(fun ...)");
}

void fus_value_print(fus_value_t value, fus_symtable_t *symtable,
    FILE *f, int indent, int depth
){
    if(value.type == FUS_TYPE_NULL){
        fprintf(f, "null");
    }else if(value.type == FUS_TYPE_BOOL){
        fprintf(f, "%c", value.data.b? 'y': 'n');
    }else if(value.type == FUS_TYPE_INT){
        fprintf(f, "%i", value.data.i);
    }else if(value.type == FUS_TYPE_BIGINT){
        fus_bigint_print(value.data.bi, symtable, f, indent, depth);
    }else if(value.type == FUS_TYPE_STR){
        fus_str_print(value.data.s, symtable, f, indent, depth);
    }else if(value.type == FUS_TYPE_SYM){
        if(symtable == NULL){
            fprintf(f, "`%i", value.data.i);
        }else{
            fus_sym_t *sym = fus_symtable_get(symtable, value.data.i);
            if(sym == NULL){
                fprintf(f, "`SYM_NOT_FOUND");
            }else if(sym->is_name){
                fprintf(f, "`%s", sym->token);
            }else{
                fprintf(f, "(` %s)", sym->token);
            }
        }
    }else if(value.type == FUS_TYPE_ARR){
        fus_arr_print(value.data.a, symtable, f, indent, depth);
    }else if(value.type == FUS_TYPE_OBJ){
        fus_obj_print(value.data.o, symtable, f, indent, depth);
    }else if(value.type == FUS_TYPE_FUN){
        fus_fun_print(value.data.f, symtable, f, indent, depth);
    }else{
        fprintf(f, "\"Unknown type: %i\" error", value.type);
    }
}

