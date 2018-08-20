
#include "includes.h"


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
        FUS_VALUE_ATTACH(bigint, bi, value)
    }else if(value.type == FUS_TYPE_STR){
        FUS_VALUE_ATTACH(str, s, value)
    }else if(value.type == FUS_TYPE_ARR){
        FUS_VALUE_ATTACH(arr, a, value)
    }else if(value.type == FUS_TYPE_OBJ){
        FUS_VALUE_ATTACH(obj, o, value)
    }
}

void fus_value_detach(fus_value_t value){
    if(value.type == FUS_TYPE_BIGINT){
        FUS_VALUE_DETACH(bigint, bi, value)
    }else if(value.type == FUS_TYPE_STR){
        FUS_VALUE_DETACH(str, s, value)
    }else if(value.type == FUS_TYPE_ARR){
        FUS_VALUE_DETACH(arr, a, value)
    }else if(value.type == FUS_TYPE_OBJ){
        FUS_VALUE_DETACH(obj, o, value)
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
    fus_str_t *s = malloc(sizeof(*s));
    if(s == NULL)return NULL;
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
    FUS_VALUE_ATTACH(str, s, value)
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
    FUS_VALUE_ATTACH(arr, a, value)
    return value;
}

fus_value_t fus_value_obj(fus_obj_t *o){
    fus_value_t value;
    value.type = FUS_TYPE_OBJ;
    value.data.o = o;
    FUS_VALUE_ATTACH(obj, o, value)
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
        fprintf(f, "\"No representation for bigints yet\" error");
    }else if(value.type == FUS_TYPE_STR){
        /* TODO: Properly escape strings */
        fprintf(stderr, "TODO: Properly escape strings in %s\n", __FILE__);
        fprintf(f, "\"%s\"", value.data.s == NULL? "": value.data.s->text);
    }else if(value.type == FUS_TYPE_ARR){
        fprintf(f, "arr");
        fus_arr_t *a = value.data.a;
        if(a != NULL){
            for(int i = 0; i < a->values_len; i++){
                fprintf(f, " ");
                fus_value_print(a->values[i], symtable, f,
                    indent, depth + 1);
            }
        }
    }else if(value.type == FUS_TYPE_OBJ){
        fprintf(f, "obj");
        fus_obj_t *o = value.data.o;
        if(o != NULL){
            for(int i = 0; i < o->entries_len; i++){
                fus_obj_entry_t *entry = &o->entries[i];
                fprintf(f, " ");
                fus_value_print(entry->value, symtable, f,
                    indent, depth + 1);
                const char *sym_token = fus_symtable_get_token(
                    symtable, entry->sym_i);
                fprintf(f, " =.%s ", sym_token == NULL?
                    "SYM_NOT_FOUND": sym_token);
            }
        }
    }else{
        fprintf(f, "\"Unknown type: %i\" error", value.type);
    }
}

