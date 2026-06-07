#ifndef PETCREATING_H
#define PETCREATING_H
#include <ctime>
#include <QApplication>
#include <QtGlobal>
#include <QTime>
#include <QDebug>

class pokemon : public QObject
{
    Q_OBJECT
public:
    pokemon();//构造函数，初始化一个默认小精灵,但是无法实例化成对象
    bool alive();//存活情况
    virtual QString attack() = 0;//攻击函数，根据类型有不同
    virtual QString skill() = 0;//use the power
    double atkf();//攻击频率
    int damagecost();//造成伤害
    QString damagedeal(int damage);//计算伤害，修改血量
    void changetype(int type);//实例化精灵时根据类型而调节属性
    void changeName(QString name);
    void expup(qint32 bonus);//获得经验值
    int gain();//对方会获得多少经验值
    void gainHp(int suck);//肉盾型回血专用
    bool upornot();//经验是否满足升级
    void lvlup();//升级
    void hpfull();//回满血
    QString getName();
    int getType();
    int getLvl();
    int getExp();
    void Test();//测试函数
    int getHp();
    int getFullHp();
    int getTimer();
    void setTimer(int setting);
    int getState();
    void setState(int which);
    int generateRandomInteger(int min,int max);
signals:
    void fresh();
private:
    int type;
    int level;//等级
    int exp;//经验
    int atk;//攻击力
    int def;//防御力
    int hp;//血量
    int fullhp;//满血量
    double interval;//攻击间隔
    int state = 0;
    int timer = 3;
    QString name;
};

class str_pkm : public pokemon//力量型
{
public:
    QString skill();
};

class fat_pkm : public pokemon//肉盾型
{
public:
    QString skill();
};

class def_pkm : public pokemon//防御型
{
public:
    QString skill();
};

class agi_pkm : public pokemon//敏捷型
{
public:
    QString skill();
};

class Hitmonlee : public str_pkm//沙瓦朗
{
public:
    Hitmonlee(int lvl,int exp);
    QString attack();
    void setName();
};

class Charmander : public str_pkm//小火龙
{
public:
    Charmander(int lvl,int exp);
    QString attack();
    void setName();
};

class Squirtle : public str_pkm//杰尼龟
{
public:
    Squirtle(int lvl,int exp);
    QString attack();
    void setName();
};

class Licktung : public fat_pkm//大舌头
{
public:
    Licktung(int lvl,int exp);
    QString attack();
    void setName();
};

class Muk : public fat_pkm//臭臭泥
{
public:
    Muk(int lvl,int exp);
    QString attack();
    void setName();
};

class Krabby : public fat_pkm//大钳蟹
{
public:
    Krabby(int lvl,int exp);
    QString attack();
    void setName();
};

class Geodude : public def_pkm//小拳石
{
public:
    Geodude(int lvl,int exp);
    QString attack();
    void setName();
};

class Shellder :public def_pkm//大舌贝
{
public:
    Shellder(int lvl,int exp);
    QString attack();
    void setName();
};

class Onix : public def_pkm//大岩蛇
{
public:
    Onix(int lvl,int exp);
    QString attack();
    void setName();
};

class Bulbasaur : public agi_pkm//妙蛙种子
{
public:
    Bulbasaur(int lvl,int exp);
    QString attack();
    void setName();
};

class Pidgeotto : public agi_pkm//比比鸟
{
public:
    Pidgeotto(int lvl,int exp);
    QString attack();
    void setName();
};

class Pikachu : public agi_pkm//皮卡丘
{
public:
    Pikachu(int lvl,int exp);
    QString attack();
    void setName();
};

pokemon* chooseyourpet();


#endif // PETCREATING_H
